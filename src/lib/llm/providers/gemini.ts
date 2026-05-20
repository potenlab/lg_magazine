import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMRequest, LLMResult } from "../provider";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  }

  async generateText(req: LLMRequest): Promise<LLMResult> {
    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: req.system,
    });
    // gemini-2.5-* 계열은 기본적으로 "thinking" 토큰을 출력 예산에서 차감해
    // 호출자가 의도한 maxTokens가 사실상 1/4~1/3로 줄어든다(한국어 한 줄도 잘림).
    // (1) thinkingBudget을 0으로 강제해서 thinking을 끄고,
    // (2) 안전 마진으로 maxTokens를 1.5배 늘려둔다. 둘 다 Gemini-only 처리라
    //     Claude/OpenAI provider 동작에는 영향 없음.
    const baseMax = req.maxTokens ?? 300;
    // SDK 타입엔 thinkingConfig가 없지만 런타임 API는 받아준다. unknown 캐스트로 우회.
    const generationConfig = {
      maxOutputTokens: Math.ceil(baseMax * 1.5),
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as { maxOutputTokens: number };
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig,
    });
    const text = res.response.text();
    if (!text) throw new Error("gemini: no text in response");
    const meta = res.response.usageMetadata;
    return {
      text: text.trim(),
      usage: meta
        ? {
            promptTokens: meta.promptTokenCount,
            completionTokens: meta.candidatesTokenCount,
          }
        : undefined,
    };
  }
}
