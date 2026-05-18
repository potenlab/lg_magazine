import type { LLMContract } from "./contract";
import { realLLM } from "./realLLM";

// realLLM hits /api/v3/llm (which uses the provider configured by LLM_PROVIDER env).
// Each method falls back to stubLLM internally if the API call fails — so the demo
// never hard-fails when an API key is missing or the provider is down.
export const llm: LLMContract = realLLM;
