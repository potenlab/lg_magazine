import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResult } from "../provider";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
  }

  async generateText(req: LLMRequest): Promise<LLMResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 300,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    });
    const text = res.content.find((c) => c.type === "text");
    if (!text || text.type !== "text") throw new Error("anthropic: no text in response");
    return {
      text: text.text.trim(),
      usage: {
        promptTokens: res.usage?.input_tokens,
        completionTokens: res.usage?.output_tokens,
      },
    };
  }
}
