// In-memory async job queue for LLM work.
//
// Why: the upstream AI Studio account tops out at ~20 concurrent calls. Holding
// each user's HTTP request open while they wait would hit the nginx/browser
// timeout under load. Instead, POST /api/v3/llm enqueues a job and returns a
// jobId immediately; this queue runs at most LLM_QUEUE_CONCURRENCY jobs at once
// and the client polls GET /api/v3/llm/jobs?id=... for the result. Nothing holds
// a connection open, so nothing times out — users simply wait their turn.
//
// Two lanes, one budget. "light" jobs (owl one-liners, a few seconds) and
// "heavy" jobs (chapter articles and summaries, 15–25s) share the same
// LLM_QUEUE_CONCURRENCY slots. When a slot frees, the oldest light job goes
// first so the dialog does not wait behind long writing jobs. The exception:
// while fewer than LLM_QUEUE_HEAVY_MIN heavy jobs are running, the oldest
// heavy job goes first, so a steady stream of light jobs cannot starve heavy.
// Light jobs also get only a limited head start: a heavy job that has waited
// LLM_QUEUE_HEAVY_AGING_MS longer than the oldest light job goes first, so at
// peak a heavy job never waits more than that much longer than the light line.
// Running jobs are never interrupted.
//
// Failures (errors, expiry in the queue) and long waits are logged as one JSON
// line each: {"evt":"llm_job_error",...} and {"evt":"llm_job_slow",...}.
//
// ⚠️ PER PROCESS / IN MEMORY. With multiple replicas, the enqueue POST and the
// poll GETs for one job MUST land on the same replica — configure nginx sticky
// sessions (ip_hash or a sticky cookie). Jobs are also lost on restart/deploy.
// (A Postgres-backed store would remove both constraints.)

import { randomUUID } from "node:crypto";
import type { LLMTier } from "./modeContext";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface EnqueueOptions {
  /** Which lane the job waits in. Defaults to "heavy" (no priority). */
  tier?: LLMTier;
  /** Short name for logs, e.g. the task name. */
  label?: string;
}

interface Job {
  id: string;
  status: JobStatus;
  tier: LLMTier;
  label: string | null;
  run: () => Promise<unknown>;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  slowLogged?: boolean;
  /** Last time the browser asked about this job (enqueue, poll, or held poll). */
  lastSeenAt: number;
  /** Long-poll requests waiting for this job to finish (see waitForJob). */
  waiters?: Array<() => void>;
}

// At most this many jobs execute concurrently (per process). Keep it ≤
// AISTUDIO_MAX_CONCURRENCY so the per-call gate never has to queue/reject —
// under async the queue is the concurrency control.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.LLM_QUEUE_CONCURRENCY ?? 5));
// Slots heavy jobs may claim ahead of waiting light jobs (1..MAX_CONCURRENCY).
const HEAVY_MIN = Math.min(
  MAX_CONCURRENCY,
  Math.max(1, Math.floor(Number(process.env.LLM_QUEUE_HEAVY_MIN ?? 1)) || 1),
);
// Head start light jobs get over heavy ones (see header). Default 60s.
const HEAVY_AGING_MS = (() => {
  const raw = process.env.LLM_QUEUE_HEAVY_AGING_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();
// How long a finished job's result is retained for polling before cleanup.
const JOB_TTL_MS = Number(process.env.LLM_JOB_TTL_MS ?? 120_000);
// Queued jobs nobody is waiting for any more must not run — that would burn
// upstream slots on dead work and starve live users into fallback. Two checks:
// older than the client's longest deadline (realLLM JOB_CLIENT_DEADLINE_MS, 6
// min), or not asked about for a while (the browser gave up — a dialog reply
// stops waiting after ~90 s — or the tab closed). A live browser asks at least
// every ~15 s (held poll) or ~8 s (timed poll). Heavy jobs get longer: a phone
// that locks on a waiting screen pauses the browser, and the magazine writing
// should keep its place for when the participant comes back.
const QUEUE_MAX_AGE_MS = Number(process.env.LLM_QUEUE_MAX_AGE_MS ?? 6 * 60_000);
const ABANDON_MS: Record<LLMTier, number> = {
  light: envMs("LLM_JOB_ABANDON_MS", 30_000),
  heavy: envMs("LLM_JOB_ABANDON_HEAVY_MS", 3 * 60_000),
};

/** A positive millisecond value from env; empty or invalid falls back, so a
 *  blank line in .env can't turn a limit into 0 (dropping every queued job). */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// A job that waits in line longer than this is logged once as llm_job_slow.
const SLOW_QUEUE_MS = Number(process.env.LLM_JOB_SLOW_MS ?? 30_000);

const jobs = new Map<string, Job>();
// FIFO of queued job ids, one per lane.
const lanes: Record<LLMTier, string[]> = { light: [], heavy: [] };
const runningByTier: Record<LLMTier, number> = { light: 0, heavy: 0 };
let running = 0;

function logEvent(evt: string, job: Job, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ evt, label: job.label, tier: job.tier, ...fields }));
}

/** Log once per job when it has been waiting longer than SLOW_QUEUE_MS. */
function noteSlow(job: Job, queuedMs: number): void {
  if (job.slowLogged || queuedMs <= SLOW_QUEUE_MS) return;
  job.slowLogged = true;
  logEvent("llm_job_slow", job, {
    queuedMs,
    runningLight: runningByTier.light,
    runningHeavy: runningByTier.heavy,
    queuedLight: lanes.light.length,
    queuedHeavy: lanes.heavy.length,
  });
}

/** Release every long-poll request waiting on a job that just finished. */
function wake(job: Job): void {
  const waiters = job.waiters;
  if (!waiters) return;
  job.waiters = undefined;
  for (const w of waiters) w();
}

/** Drop finished jobs whose result has aged past the TTL (keeps the map bounded). */
function sweep(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    if (j.finishedAt !== undefined && j.finishedAt < cutoff) jobs.delete(id);
  }
}

/** Oldest live job in a lane. Jobs nobody is waiting for are failed and dropped. */
function head(tier: LLMTier, now: number): Job | undefined {
  const lane = lanes[tier];
  while (lane.length > 0) {
    const job = jobs.get(lane[0]);
    if (job && job.status === "queued") {
      const queuedMs = now - job.createdAt;
      const unseenMs = now - job.lastSeenAt;
      const held = (job.waiters?.length ?? 0) > 0;
      if (!held && unseenMs > ABANDON_MS[job.tier]) {
        // The browser stopped asking: it already showed its own fallback (or
        // the tab is gone), so this is not counted as an llm_job_error.
        job.status = "error";
        job.error = "abandoned";
        job.finishedAt = now;
        logEvent("llm_job_abandoned", job, { queuedMs, unseenMs });
      } else if (queuedMs <= QUEUE_MAX_AGE_MS) {
        return job;
      } else {
        job.status = "error";
        job.error = "expired_in_queue";
        job.finishedAt = now;
        noteSlow(job, queuedMs);
        logEvent("llm_job_error", job, { error: job.error, queuedMs, runMs: null });
        wake(job);
      }
    }
    lane.shift();
  }
  return undefined;
}

/** The job that gets the next free slot (see the header comment). */
function pickNext(now: number): Job | undefined {
  const light = head("light", now);
  const heavy = head("heavy", now);
  if (!heavy) return light;
  if (!light || runningByTier.heavy < HEAVY_MIN) return heavy;
  // Heavy has waited more than HEAVY_AGING_MS longer than the oldest light job.
  if (heavy.createdAt + HEAVY_AGING_MS < light.createdAt) return heavy;
  return light;
}

function start(job: Job, now: number): void {
  lanes[job.tier].shift(); // the job is its lane's head
  const startedAt = now;
  noteSlow(job, startedAt - job.createdAt);
  job.status = "running";
  job.startedAt = startedAt;
  running++;
  runningByTier[job.tier]++;
  // Start inside a promise so a synchronous throw cannot leak the slot.
  Promise.resolve()
    .then(() => job.run())
    .then((result) => {
      job.status = "done";
      job.result = result;
    })
    .catch((err: unknown) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : String(err);
      logEvent("llm_job_error", job, {
        error: job.error.slice(0, 300),
        queuedMs: startedAt - job.createdAt,
        runMs: Date.now() - startedAt,
      });
    })
    .finally(() => {
      job.finishedAt = Date.now();
      running--;
      runningByTier[job.tier]--;
      wake(job);
      pump(); // a slot freed — pull the next queued job
    });
}

/** Start as many queued jobs as the concurrency budget allows. */
function pump(): void {
  while (running < MAX_CONCURRENCY) {
    const now = Date.now();
    const job = pickNext(now);
    if (!job) break;
    start(job, now);
  }
}

/** Enqueue work and return its job id immediately (non-blocking). */
export function enqueue(run: () => Promise<unknown>, opts: EnqueueOptions = {}): string {
  sweep();
  const id = randomUUID();
  const tier: LLMTier = opts.tier === "light" ? "light" : "heavy";
  const label = opts.label ? opts.label.slice(0, 100) : null;
  const now = Date.now();
  jobs.set(id, { id, status: "queued", tier, label, run, createdAt: now, lastSeenAt: now });
  lanes[tier].push(id);
  pump();
  return id;
}

export interface JobView {
  status: JobStatus;
  /** 1-based place in line while queued (best effort); 0 once running/finished. */
  position: number;
  result?: unknown;
  error?: string;
}

/** Best-effort place in line, following the lane rule in pickNext. */
function positionOf(job: Job): number {
  const idx = lanes[job.tier].indexOf(job.id);
  if (idx < 0) return 0;
  // Heavy jobs that will take a reserved slot are served before any light job.
  const reservedAhead = Math.min(
    lanes.heavy.length,
    Math.max(0, HEAVY_MIN - runningByTier.heavy),
  );
  if (job.tier === "light") return reservedAhead + idx + 1;
  return idx < reservedAhead ? idx + 1 : lanes.light.length + idx + 1;
}

/** Snapshot a job for the poll endpoint. Returns null if unknown/expired. */
export function getJob(id: string): JobView | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.lastSeenAt = Date.now();
  // Polls arrive every few seconds, so this is where a long wait gets noticed.
  if (job.status === "queued") noteSlow(job, Date.now() - job.createdAt);
  return {
    status: job.status,
    position: job.status === "queued" ? positionOf(job) : 0,
    ...(job.status === "done" ? { result: job.result } : {}),
    ...(job.status === "error" ? { error: job.error } : {}),
  };
}

/** Wait until a job finishes, at most maxWaitMs (long-poll). Resolves at once if
 *  the job is unknown or already finished, early if `signal` aborts (the
 *  browser went away), and never rejects. The caller then reads getJob(). */
export function waitForJob(id: string, maxWaitMs: number, signal?: AbortSignal): Promise<void> {
  const job = jobs.get(id);
  if (!job) return Promise.resolve();
  job.lastSeenAt = Date.now();
  if (job.status === "done" || job.status === "error") return Promise.resolve();
  if (!(maxWaitMs > 0) || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      job.lastSeenAt = Date.now();
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      const i = job.waiters?.indexOf(finish) ?? -1;
      if (i >= 0) job.waiters!.splice(i, 1);
      resolve();
    };
    const timer = setTimeout(finish, maxWaitMs);
    signal?.addEventListener("abort", finish, { once: true });
    (job.waiters ??= []).push(finish);
  });
}

/** Live counters (for diagnostics/logging). */
export function queueStats(): {
  running: number;
  queued: number;
  total: number;
  runningLight: number;
  runningHeavy: number;
  queuedLight: number;
  queuedHeavy: number;
} {
  return {
    running,
    queued: lanes.light.length + lanes.heavy.length,
    total: jobs.size,
    runningLight: runningByTier.light,
    runningHeavy: runningByTier.heavy,
    queuedLight: lanes.light.length,
    queuedHeavy: lanes.heavy.length,
  };
}
