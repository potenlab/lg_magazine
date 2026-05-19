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

async function callTask<T>(task: string, payload: unknown): Promise<T> {
  const res = await fetch("/api/v3/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`v3 LLM /api error ${res.status}: ${detail.slice(0, 160)}`);
  }
  const json = (await res.json()) as { result: T };
  return json.result;
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
      return await callTask<string>("reflectPoetic", input);
    } catch (err) {
      console.warn("[v3 LLM] reflectPoetic fell back to stub:", err);
      return stubLLM.reflectPoetic(input);
    }
  },

  async reflectValues(input) {
    try {
      return await callTask<string>("reflectValues", input);
    } catch (err) {
      console.warn("[v3 LLM] reflectValues fell back to stub:", err);
      return stubLLM.reflectValues(input);
    }
  },

  async reflectStrength(input) {
    try {
      return await callTask<{ commonAsk: string; linkedValue: string }>("reflectStrength", input);
    } catch (err) {
      console.warn("[v3 LLM] reflectStrength fell back to stub:", err);
      return stubLLM.reflectStrength(input);
    }
  },

  async synthesizeStrength(input) {
    try {
      const r = await callTask<{ synthesis: string }>("synthesizeStrength", input);
      // Server may return an empty synthesis on parse failure (soft fallback);
      // route to stub in that case so the scene always has something to show.
      if (!r.synthesis?.trim()) return stubLLM.synthesizeStrength(input);
      return r;
    } catch (err) {
      console.warn("[v3 LLM] synthesizeStrength fell back to stub:", err);
      return stubLLM.synthesizeStrength(input);
    }
  },

  async synthesizeGrowthVision(input) {
    try {
      const r = await callTask<{ synthesis: string }>("synthesizeGrowthVision", input);
      if (!r.synthesis?.trim()) return stubLLM.synthesizeGrowthVision(input);
      return r;
    } catch (err) {
      console.warn("[v3 LLM] synthesizeGrowthVision fell back to stub:", err);
      return stubLLM.synthesizeGrowthVision(input);
    }
  },

  async generateVisionDirections(input) {
    try {
      return await callTask<{ directions: string[] }>("generateVisionDirections", input);
    } catch (err) {
      console.warn("[v3 LLM] generateVisionDirections fell back to stub:", err);
      return stubLLM.generateVisionDirections(input);
    }
  },

  async generateTimeHorizon(input) {
    try {
      return await callTask<{ horizon: string[] }>("generateTimeHorizon", input);
    } catch (err) {
      console.warn("[v3 LLM] generateTimeHorizon fell back to stub:", err);
      return stubLLM.generateTimeHorizon(input);
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
      console.warn("[v3 LLM] observePattern fell back to stub:", err);
      return stubLLM.observePattern(input);
    }
  },

  async writeChapterArticle(input) {
    try {
      return await callTask<{ headline: string; body: string; pullQuote: string | null }>(
        "writeChapterArticle",
        input,
      );
    } catch (err) {
      console.warn("[v3 LLM] writeChapterArticle fell back to stub:", err);
      return stubLLM.writeChapterArticle(input);
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
