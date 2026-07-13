// Client-side implementation of LLMContract that hits /api/v3/llm.
// Falls back to stub on network/server errors so the demo never hard-fails.

import type { LLMContract } from "./contract";
import type { Branch } from "@/lib/v3/scenes/types";
import { stubLLM } from "./stub";
import { judgeBranchHeuristic, ruleForScene, type BranchRule } from "@/lib/v3/judging/heuristics";

// Per-rule "you've clearly answered enough" exit branches. Used by the length
// pre-pass below to auto-advance long-form answers without round-tripping to
// the LLM judge (which over-rejects long but unconventional answers).
const LONG_ANSWER_EXIT: Partial<Record<BranchRule, Branch>> = {
  ch1FlowAnswer: "D",
  ch2Common: "D",
  ch2IdentityName: "D",
  ch3FutureSelf: "D",
  ch3FutureDay: "D",
  ch3VisionLine: "D",
  ch3Attraction: "D",
  ch3AlreadyDoing: "D",
  ch3Obstacles: "D",
  ch3WhyReason: "D",
  ch3Contribution: "D",
  ch4FirstStep: "D",
  ch4SupportPerson: "D",
  ch4NeededResource: "D",
};

/** Tell the length pre-pass apart from low-effort filler ("ㅇㅇㅇㅇ…",
 * "ㅋㅋㅋ…", "aaaaaa…"). Real sentences carry Korean syllables (가-힣) or
 * Latin letters, plus character variety. If both signals are weak the
 * length gate must NOT fire — let the LLM judge handle it. */
function looksMeaningful(text: string): boolean {
  const s = text.replace(/\s+/g, "");
  if (s.length < 10) return false;
  let syllables = 0;
  let latin = 0;
  for (const c of s) {
    const code = c.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) syllables++;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++;
  }
  const meaningful = syllables + latin;
  // At least 10 real letters, and they make up a real share of the text
  // (filters answers padded with punctuation/jamo spam).
  if (meaningful < 10) return false;
  if (meaningful / s.length < 0.5) return false;
  // Character diversity — "ㅇㅇㅇ…" of 80 chars is 1 unique / 80 = 0.0125.
  const unique = new Set(s).size;
  if (unique / s.length < 0.15) return false;
  return true;
}

/** URL 첫 segment에서 LLM mode + deep 토글을 동시에 뽑는다.
 *
 *  매핑:
 *    /           → { mode: null, deep: false }  (env 기본값 = Claude)
 *    /claude     → { mode: "claude", deep: false }
 *    /gem        → { mode: "gem",    deep: false }
 *    /mix        → { mode: "mix",    deep: false }
 *    /deep       → { mode: null,     deep: true } (env 기본값 + Deep)
 *    /gem_deep   → { mode: "gem",    deep: true }
 *    /mix_deep   → { mode: "mix",    deep: true }
 */
export function readUrlConfig(): { mode: "gem" | "claude" | "mix" | null; deep: boolean } {
  if (typeof window === "undefined") return { mode: null, deep: false };
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  switch (seg) {
    case "claude":
      return { mode: "claude", deep: false };
    case "gem":
      return { mode: "gem", deep: false };
    case "mix":
      return { mode: "mix", deep: false };
    case "deep":
      return { mode: null, deep: true };
    case "gem_deep":
      return { mode: "gem", deep: true };
    case "mix_deep":
      return { mode: "mix", deep: true };
    default:
      return { mode: null, deep: false };
  }
}

// Client poll cadence + a generous safety deadline for a genuinely stuck job.
const JOB_CLIENT_DEADLINE_MS = 6 * 60_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Adaptive poll cadence: fast while the job is young (light tasks finish in
// a few seconds), slower the longer it waits — a long wait means a slow
// provider / deep queue, and hammering /jobs every 1.5s is exactly what
// amplified HTTP load at peak in the Jul 13 600-user run (see
// docs/loadtest-600-per-step-before-after-jul13.md §3b). Worst case this adds
// ~6s of poll lag to a wait that is already minutes long.
function pollDelay(elapsedMs: number): number {
  if (elapsedMs < 10_000) return 1_500;
  if (elapsedMs < 30_000) return 3_000;
  if (elapsedMs < 60_000) return 5_000;
  return 8_000;
}

// Recoverable failures the server explicitly signals as such: HTTP 429
// ("busy — Retry-After" from a saturated gate or a near-lift quota cooldown),
// a job lost to a deploy/replica rebalance (poll 404), a job that errored
// on the busy signal, or a transient reject in front of the app (5xx /
// dropped connection under a load spike). These recover in seconds, so retry
// a bounded number of times before letting the caller fall back to the stub.
const RESUBMIT_MAX = 3;
const BUSY_RETRY_MS = 3_000;
// Jitter so 600 clients rejected by the same load spike don't resubmit in
// the same instant and re-create the spike.
const retryPause = () => wait(BUSY_RETRY_MS + Math.random() * 2_000);

function isRecoverableJobError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("job expired or not found") || msg.includes("llm_busy");
}

// Heavy synthesis tasks run behind explicit waiting screens, so a long quota
// cooldown (Retry-After up to ~90s) is worth sitting out for real content.
// Interactive dialog beats (judge, reflections) must not freeze — they only
// retry the short "busy" case and otherwise fall back fast.
const LONG_WAIT_TASKS = new Set([
  "synthesizeStrength",
  "synthesizeGrowthVision",
  "writeChapterArticle",
  "writeEditorNote",
  "writeCoverHeadline",
  "generateVisionDirections",
  "generateTimeHorizon",
  "generateJobTrendCards",
  "reflectStrength",
  "observePattern",
]);

async function callTask<T>(task: string, payload: unknown): Promise<T> {
  const { mode, deep } = readUrlConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode) headers["x-llm-mode"] = mode;
  if (deep) headers["x-llm-deep"] = "1";
  const body = JSON.stringify({ task, payload });

  for (let resubmits = 0; ; resubmits++) {
    let res: Response;
    try {
      res = await fetch("/api/v3/llm", { method: "POST", headers, body });
    } catch (err) {
      // Network blip (connection reset/refused mid-spike) — same transient
      // class as a 5xx below; retry instead of dropping straight to stub.
      if (resubmits < RESUBMIT_MAX) {
        await retryPause();
        continue;
      }
      throw err;
    }

    // Server said "busy, retry in N seconds" — honor it instead of treating
    // a 3-second congestion blip as a hard failure (which put stub content
    // on screen permanently for that scene).
    if (res.status === 429 && resubmits < RESUBMIT_MAX) {
      const after = Number(res.headers.get("Retry-After")) || 3;
      if (LONG_WAIT_TASKS.has(task) || after <= 5) {
        await wait(Math.min(after, 120) * 1000);
        continue;
      }
      // Interactive task facing a long cooldown → fall back fast instead of
      // freezing the dialog.
    }

    // Async server (LLM_ASYNC): 202 + { jobId } → poll until the job finishes.
    // The request was never held open, so there's no server-side timeout to hit;
    // the user simply waits in line. Sync server still returns 200 + { result }.
    if (res.status === 202) {
      const { jobId } = (await res.json()) as { jobId: string };
      try {
        return await pollJob<T>(jobId);
      } catch (err) {
        // Jobs live in one replica's memory — a deploy/rebalance 404s every
        // in-flight poll. Resubmitting the task is the intended recovery.
        if (resubmits < RESUBMIT_MAX && isRecoverableJobError(err)) {
          await wait(BUSY_RETRY_MS);
          continue;
        }
        throw err;
      }
    }

    // Transient rejection in front of the app (nginx/replica 5xx during a
    // load spike — the Jul 13 600-user run's dominant failure). The blip
    // clears in seconds; a jittered resubmit lands after it.
    if (res.status >= 500 && resubmits < RESUBMIT_MAX) {
      await retryPause();
      continue;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`v3 LLM /api error ${res.status}: ${detail.slice(0, 160)}`);
    }
    const json = (await res.json()) as { result: T };
    return json.result;
  }
}

async function pollJob<T>(jobId: string): Promise<T> {
  const started = Date.now();
  for (;;) {
    await wait(pollDelay(Date.now() - started));
    const res = await fetch(`/api/v3/llm/jobs?id=${encodeURIComponent(jobId)}`);
    if (res.status === 404) throw new Error("v3 LLM job expired or not found");
    if (res.ok) {
      const job = (await res.json()) as { status: string; result?: T; error?: string };
      if (job.status === "done") return job.result as T;
      if (job.status === "error") throw new Error(job.error || "v3 LLM job failed");
      // queued / running → keep waiting
    }
    if (Date.now() - started > JOB_CLIENT_DEADLINE_MS) {
      throw new Error("v3 LLM job timed out (client deadline)");
    }
  }
}

export const realLLM: LLMContract = {
  // Branch judge: LLM-first for nuance (especially the 일반론 / C case which
  // keyword matching can't catch). Falls back to heuristic on any error so
  // the demo never hard-fails on a follow-up.
  async judgeBranch({ sceneId, answer }) {
    const rule = ruleForScene(sceneId);
    // Length pre-pass for free-form answers: if a participant has clearly
    // poured effort in (long, multi-line, with their own context), the judge
    // should never bounce them back asking to "rephrase" — that just feels
    // like the editor isn't reading. Auto-pass to the exit branch — but only
    // if the text actually looks meaningful, so jamo/letter spam ("ㅇㅇㅇ…")
    // padded out to 80 chars still gets routed to the LLM judge.
    const trimmed = answer.trim();
    if (trimmed.length >= 80 && looksMeaningful(trimmed)) {
      const exit = LONG_ANSWER_EXIT[rule];
      if (exit) return { branch: exit, reason: "long-form answer auto-pass" };
    }
    try {
      return await callTask<{ branch: "A" | "B" | "C" | "D"; reason: string }>(
        "judgeBranch",
        { rule, answer },
      );
    } catch (err) {
      console.warn("[v3 LLM] judgeBranch fell back to heuristic:", err);
      return judgeBranchHeuristic(rule, answer);
    }
  },

  async reflectShort(input) {
    try {
      return await callTask<string>("reflectShort", input);
    } catch (err) {
      console.warn("[v3 LLM] reflectShort fell back to stub:", err);
      return stubLLM.reflectShort(input);
    }
  },

  async rephraseLight(input) {
    try {
      return await callTask<string>("rephraseLight", input);
    } catch (err) {
      console.warn("[v3 LLM] rephraseLight fell back to stub:", err);
      return stubLLM.rephraseLight(input);
    }
  },

  async comfortReassure(input) {
    try {
      return await callTask<string>("comfortReassure", input);
    } catch (err) {
      console.warn("[v3 LLM] comfortReassure fell back to stub:", err);
      return stubLLM.comfortReassure(input);
    }
  },

  async reflectPoetic(input) {
    try {
      const r = await callTask<string>("reflectPoetic", input);
      if (!r?.trim()) {
        console.warn("[v3 LLM][STUB-FALLBACK] reflectPoetic: empty output → using generic stub.");
        const s = await stubLLM.reflectPoetic(input);
        return { ...s, fromStub: true };
      }
      return { text: r };
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] reflectPoetic threw → using generic stub:", err);
      const s = await stubLLM.reflectPoetic(input);
      return { ...s, fromStub: true };
    }
  },

  async reflectValues(input) {
    try {
      const r = await callTask<string>("reflectValues", input);
      if (!r?.trim()) {
        console.warn("[v3 LLM][STUB-FALLBACK] reflectValues: empty output → using generic stub.");
        const s = await stubLLM.reflectValues(input);
        return { ...s, fromStub: true };
      }
      return { text: r };
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] reflectValues threw → using generic stub:", err);
      const s = await stubLLM.reflectValues(input);
      return { ...s, fromStub: true };
    }
  },

  async reflectStrength(input) {
    try {
      return await callTask<{ commonAsk: string; linkedValue: string }>("reflectStrength", input);
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] reflectStrength threw → using generic stub:", err);
      const s = await stubLLM.reflectStrength(input);
      return { ...s, fromStub: true };
    }
  },

  async synthesizeStrength(input) {
    try {
      const r = await callTask<{ synthesis: string }>("synthesizeStrength", input);
      // Server may return an empty synthesis on parse failure (soft fallback);
      // route to stub in that case so the scene always has something to show.
      if (!r.synthesis?.trim()) {
        console.warn("[v3 LLM][STUB-FALLBACK] synthesizeStrength: empty synthesis from server → using generic stub. Output will look general.");
        const s = await stubLLM.synthesizeStrength(input);
        return { ...s, fromStub: true };
      }
      return r;
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] synthesizeStrength threw → using generic stub:", err);
      const s = await stubLLM.synthesizeStrength(input);
      return { ...s, fromStub: true };
    }
  },

  async synthesizeGrowthVision(input) {
    try {
      const r = await callTask<{ synthesis: string }>("synthesizeGrowthVision", input);
      if (!r.synthesis?.trim()) {
        console.warn("[v3 LLM][STUB-FALLBACK] synthesizeGrowthVision: empty synthesis from server → using generic stub. Output will look general.");
        const s = await stubLLM.synthesizeGrowthVision(input);
        return { ...s, fromStub: true };
      }
      return r;
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] synthesizeGrowthVision threw → using generic stub:", err);
      const s = await stubLLM.synthesizeGrowthVision(input);
      return { ...s, fromStub: true };
    }
  },

  async generateVisionDirections(input) {
    try {
      return await callTask<{ directions: string[] }>("generateVisionDirections", input);
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] generateVisionDirections threw → using generic stub:", err);
      const s = await stubLLM.generateVisionDirections(input);
      return { ...s, fromStub: true };
    }
  },

  async generateJobTrendCards(input) {
    try {
      const r = await callTask<{ cards: { direction: string; context: string }[] }>(
        "generateJobTrendCards",
        input,
      );
      if (!r.cards || r.cards.length < 3) {
        console.warn("[v3 LLM][STUB-FALLBACK] generateJobTrendCards: insufficient cards → using generic stub.");
        const s = await stubLLM.generateJobTrendCards(input);
        return { ...s, fromStub: true };
      }
      return r;
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] generateJobTrendCards threw → using generic stub:", err);
      const s = await stubLLM.generateJobTrendCards(input);
      return { ...s, fromStub: true };
    }
  },

  async generateTimeHorizon(input) {
    try {
      return await callTask<{ horizon: string[] }>("generateTimeHorizon", input);
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] generateTimeHorizon threw → using generic stub:", err);
      const s = await stubLLM.generateTimeHorizon(input);
      return { ...s, fromStub: true };
    }
  },

  async extractKeyword(input) {
    try {
      return await callTask<string>("extractKeyword", input);
    } catch (err) {
      console.warn("[v3 LLM] extractKeyword fell back to stub:", err);
      return stubLLM.extractKeyword(input);
    }
  },

  async observePattern(input) {
    try {
      return await callTask<{ situationPattern: string; behaviorPattern: string }>("observePattern", input);
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] observePattern threw → using template stub:", err);
      const s = await stubLLM.observePattern(input);
      return { ...s, fromStub: true };
    }
  },

  async writeChapterArticle(input) {
    try {
      return await callTask<{ headline: string; body: string; pullQuote: string | null }>(
        "writeChapterArticle",
        input,
      );
    } catch (err) {
      console.warn("[v3 LLM][STUB-FALLBACK] writeChapterArticle threw → using template stub:", err);
      const s = await stubLLM.writeChapterArticle(input);
      return { ...s, fromStub: true };
    }
  },

  async writeEditorNote(input) {
    try {
      return await callTask<string>("writeEditorNote", input);
    } catch (err) {
      console.warn("[v3 LLM] writeEditorNote fell back to stub:", err);
      return stubLLM.writeEditorNote(input);
    }
  },

  async writeCoverHeadline(input) {
    try {
      return await callTask<string>("writeCoverHeadline", input);
    } catch (err) {
      console.warn("[v3 LLM] writeCoverHeadline fell back to stub:", err);
      return stubLLM.writeCoverHeadline(input);
    }
  },
};
