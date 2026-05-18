import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResult } from "../provider";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  async generateText(req: LLMRequest): Promise<LLMResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 300,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error("openai: no text in response");
    return {
      text: text.trim(),
      usage: {
        promptTokens: res.usage?.prompt_tokens,
        completionTokens: res.usage?.completion_tokens,
      },
    };
  }
}
