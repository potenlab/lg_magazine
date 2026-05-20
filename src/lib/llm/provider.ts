export interface LLMRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LLMUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface LLMResult {
  text: string;
  usage?: LLMUsage;
}

export interface LLMProvider {
  readonly name: string;
  generateText(req: LLMRequest): Promise<LLMResult>;
}

const cache = new Map<string, LLMProvider>();

async function makeProvider(name: string): Promise<LLMProvider> {
  const cached = cache.get(name);
  if (cached) return cached;
  let provider: LLMProvider;
  switch (name) {
    case "openai": {
      const { OpenAIProvider } = await import("./providers/openai");
      provider = new OpenAIProvider();
      break;
    }
    case "gemini": {
      const { GeminiProvider } = await import("./providers/gemini");
      provider = new GeminiProvider();
      break;
    }
    case "aistudio": {
      const { AIStudioProvider } = await import("./providers/aistudio");
      provider = new AIStudioProvider();
      break;
    }
    case "anthropic":
    default: {
      const { AnthropicProvider } = await import("./providers/anthropic");
      provider = new AnthropicProvider();
      break;
    }
  }
  cache.set(name, provider);
  return provider;
}

/** 전역 기본 provider.
 *  우선순위: URL mode context (gem/claude/mix) > LLM_PROVIDER env > anthropic */
export async function getProvider(): Promise<LLMProvider> {
  const { resolveProviderName } = await import("./modeContext");
  const fromMode = resolveProviderName("default");
  const which = (fromMode || process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  return makeProvider(which);
}

/**
 * 태스크별 provider 선택.
 *
 * 우선순위:
 *   1) URL mode context (gem/claude/mix) — task별 매핑 적용
 *   2) LLM_PROVIDER_<TASK> 환경변수 (예: LLM_PROVIDER_SYNTHESIS=gemini)
 *   3) LLM_PROVIDER 전역 기본값
 */
export async function getProviderFor(task: string): Promise<LLMProvider> {
  const { resolveProviderName } = await import("./modeContext");
  const key = `LLM_PROVIDER_${task.toUpperCase()}`;
  const taskKey = task.toLowerCase() === "synthesis" ? "synthesis" : "default";
  const fromMode = resolveProviderName(taskKey);
  const which = (fromMode || process.env[key] || process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  return makeProvider(which);
}
