// Request-scoped LLM mode. Set by /api/v3/llm route from the x-llm-mode header,
// read by provider.ts when resolving which provider to instantiate.
//
// URL 모드:
//   gem    → 전체 Gemini
//   claude → 전체 Anthropic
//   mix    → 평소 챕터 진행은 Gemini, 종합(2-10/3-10)만 Anthropic
//   (없음) → env(LLM_PROVIDER / LLM_PROVIDER_SYNTHESIS) 기본값
//
// AsyncLocalStorage를 쓰면 prompts.ts의 모든 함수가 시그니처 변경 없이
// 자동으로 현재 요청의 모드를 따른다.

import { AsyncLocalStorage } from "node:async_hooks";

export type LLMMode = "gem" | "claude" | "mix" | null;

interface ModeContext {
  mode: LLMMode;
  /** ?deep=1 query 토글. true면 reflection 태스크에 "격차·대비 강조" 지시 블록을
   *  추가한다. false/미설정이면 기존 동작 그대로 (safe default). */
  deep: boolean;
}

const storage = new AsyncLocalStorage<ModeContext>();

export function runWithMode<T>(mode: LLMMode, deep: boolean, fn: () => Promise<T>): Promise<T> {
  return storage.run({ mode, deep }, fn);
}

export function getMode(): LLMMode {
  return storage.getStore()?.mode ?? null;
}

/** 적극 해석 모드 여부 (?deep=1). reflection 프롬프트가 분기에 사용. */
export function getDeep(): boolean {
  return storage.getStore()?.deep ?? false;
}

/** mode + task → provider 이름. mode가 없으면 env 기본값을 따름(null 반환). */
export function resolveProviderName(task: "default" | "synthesis"): string | null {
  const mode = getMode();
  if (!mode) return null;
  if (mode === "gem") return "gemini";
  if (mode === "claude") return "anthropic";
  if (mode === "mix") return task === "synthesis" ? "anthropic" : "gemini";
  return null;
}
