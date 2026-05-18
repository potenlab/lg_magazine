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

let cached: LLMProvider | null = null;

export async function getProvider(): Promise<LLMProvider> {
  if (cached) return cached;
  const which = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  switch (which) {
    case "openai": {
      const { OpenAIProvider } = await import("./providers/openai");
      cached = new OpenAIProvider();
      break;
    }
    case "gemini": {
      const { GeminiProvider } = await import("./providers/gemini");
      cached = new GeminiProvider();
      break;
    }
    case "aistudio": {
      const { AIStudioProvider } = await import("./providers/aistudio");
      cached = new AIStudioProvider();
      break;
    }
    case "anthropic":
    default: {
      const { AnthropicProvider } = await import("./providers/anthropic");
      cached = new AnthropicProvider();
      break;
    }
  }
  return cached;
}
