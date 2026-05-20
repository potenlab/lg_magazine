import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import type { LLMProvider, LLMRequest, LLMResult } from "../provider";

/** 일부 실행 환경(Claude Code 샌드박스 등)이 ANTHROPIC_API_KEY를 빈 문자열로
 *  강제 주입해 dotenv가 `.env.local` 값을 덮지 못하는 경우가 있다.
 *  process.env가 비어있으면 `.env.local`을 직접 파싱해서 fallback으로 사용. */
function resolveAnthropicKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    if (!fs.existsSync(envPath)) return undefined;
    const text = fs.readFileSync(envPath, "utf8");
    const m = text.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+?)\s*$/m);
    const value = m?.[1]?.replace(/^["']|["']$/g, "");
    return value && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = resolveAnthropicKey();
    this.client = new Anthropic({ apiKey });
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
