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
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 300,
      },
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
