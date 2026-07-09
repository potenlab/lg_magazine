// In-memory async job queue for LLM work.
//
// Why: the upstream AI Studio account tops out at ~20 concurrent calls. Holding
// each user's HTTP request open while they wait would hit the nginx/browser
// timeout under load. Instead, POST /api/v3/llm enqueues a job and returns a
// jobId immediately; this queue runs at most LLM_QUEUE_CONCURRENCY jobs at once
// and the client polls GET /api/v3/llm/jobs?id=... for the result. Nothing holds
// a connection open, so nothing times out — users simply wait their turn.
//
// ⚠️ PER PROCESS / IN MEMORY. With multiple replicas, the enqueue POST and the
// poll GETs for one job MUST land on the same replica — configure nginx sticky
// sessions (ip_hash or a sticky cookie). Jobs are also lost on restart/deploy.
// (A Postgres-backed store would remove both constraints.)

import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "done" | "error";

interface Job {
  id: string;
  status: JobStatus;
  run: () => Promise<unknown>;
  result?: unknown;
  error?: string;
  createdAt: number;
  finishedAt?: number;
}

// At most this many jobs execute concurrently (per process). Keep it ≤
// AISTUDIO_MAX_CONCURRENCY so the per-call gate never has to queue/reject —
// under async the queue is the concurrency control.
const MAX_CONCURRENCY = Math.max(1, Number(process.env.LLM_QUEUE_CONCURRENCY ?? 5));
// How long a finished job's result is retained for polling before cleanup.
const JOB_TTL_MS = Number(process.env.LLM_JOB_TTL_MS ?? 120_000);
// Queued jobs older than the client's 6-minute polling deadline (realLLM
// JOB_CLIENT_DEADLINE_MS) have no listener left — running them would burn
// upstream slots on dead work and starve live users into fallback.
const QUEUE_MAX_AGE_MS = Number(process.env.LLM_QUEUE_MAX_AGE_MS ?? 6 * 60_000);

const jobs = new Map<string, Job>();
const pending: string[] = []; // FIFO of queued job ids
let running = 0;

/** Drop finished jobs whose result has aged past the TTL (keeps the map bounded). */
function sweep(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    if (j.finishedAt !== undefined && j.finishedAt < cutoff) jobs.delete(id);
  }
}

/** Start as many queued jobs as the concurrency budget allows. */
function pump(): void {
  while (running < MAX_CONCURRENCY && pending.length > 0) {
    const id = pending.shift();
    if (id === undefined) break;
    const job = jobs.get(id);
    if (!job || job.status !== "queued") continue;
    if (Date.now() - job.createdAt > QUEUE_MAX_AGE_MS) {
      job.status = "error";
      job.error = "expired_in_queue";
      job.finishedAt = Date.now();
      continue;
    }
    job.status = "running";
    running++;
    job
      .run()
      .then((result) => {
        job.status = "done";
        job.result = result;
      })
      .catch((err: unknown) => {
        job.status = "error";
        job.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        job.finishedAt = Date.now();
        running--;
        pump(); // a slot freed — pull the next queued job
      });
  }
}

/** Enqueue work and return its job id immediately (non-blocking). */
export function enqueue(run: () => Promise<unknown>): string {
  sweep();
  const id = randomUUID();
  jobs.set(id, { id, status: "queued", run, createdAt: Date.now() });
  pending.push(id);
  pump();
  return id;
}

export interface JobView {
  status: JobStatus;
  /** 1-based place in line while queued; 0 once running/finished. */
  position: number;
  result?: unknown;
  error?: string;
}

/** Snapshot a job for the poll endpoint. Returns null if unknown/expired. */
export function getJob(id: string): JobView | null {
  const job = jobs.get(id);
  if (!job) return null;
  const position = job.status === "queued" ? pending.indexOf(id) + 1 : 0;
  return {
    status: job.status,
    position,
    ...(job.status === "done" ? { result: job.result } : {}),
    ...(job.status === "error" ? { error: job.error } : {}),
  };
}

/** Live counters (for diagnostics/logging). */
export function queueStats(): { running: number; queued: number; total: number } {
  return { running, queued: pending.length, total: jobs.size };
}
