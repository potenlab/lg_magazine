import { NextResponse } from "next/server";
import { validateBody } from "@/lib/llmInput";
import {
  v3JudgeBranch,
  v3ReflectShort,
  v3RephraseLight,
  v3ComfortReassure,
  v3ReflectPoetic,
  v3ReflectValues,
  v3ReflectStrength,
  v3SynthesizeStrength,
  v3SynthesizeGrowthVision,
  v3GenerateVisionDirections,
  v3GenerateTimeHorizon,
  v3ExtractKeyword,
  v3ObservePattern,
  v3WriteChapterArticle,
  v3WriteEditorNote,
  v3WriteCoverHeadline,
} from "@/lib/v3/llm/prompts";

export const runtime = "nodejs";

type Task =
  | "judgeBranch"
  | "reflectShort"
  | "rephraseLight"
  | "comfortReassure"
  | "reflectPoetic"
  | "reflectValues"
  | "reflectStrength"
  | "synthesizeStrength"
  | "synthesizeGrowthVision"
  | "generateVisionDirections"
  | "generateTimeHorizon"
  | "extractKeyword"
  | "observePattern"
  | "writeChapterArticle"
  | "writeEditorNote"
  | "writeCoverHeadline";

interface V3LLMBody {
  task: Task;
  payload: Record<string, unknown>;
  sessionId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as V3LLMBody;
    if (!body.task || !body.payload) {
      return NextResponse.json({ error: "missing task or payload" }, { status: 400 });
    }
    const cap = validateBody(body.payload);
    if (!cap.ok) return NextResponse.json({ error: cap.error }, { status: 400 });

    let result: unknown;
    switch (body.task) {
      case "judgeBranch":
        result = await v3JudgeBranch(body.payload as Parameters<typeof v3JudgeBranch>[0]);
        break;
      case "reflectShort":
        result = await v3ReflectShort(body.payload as Parameters<typeof v3ReflectShort>[0]);
        break;
      case "rephraseLight":
        result = await v3RephraseLight(body.payload as Parameters<typeof v3RephraseLight>[0]);
        break;
      case "comfortReassure":
        result = await v3ComfortReassure(body.payload as Parameters<typeof v3ComfortReassure>[0]);
        break;
      case "reflectPoetic":
        result = await v3ReflectPoetic(body.payload as Parameters<typeof v3ReflectPoetic>[0]);
        break;
      case "reflectValues":
        result = await v3ReflectValues(body.payload as Parameters<typeof v3ReflectValues>[0]);
        break;
      case "reflectStrength":
        result = await v3ReflectStrength(body.payload as Parameters<typeof v3ReflectStrength>[0]);
        break;
      case "synthesizeStrength":
        result = await v3SynthesizeStrength(body.payload as Parameters<typeof v3SynthesizeStrength>[0]);
        break;
      case "synthesizeGrowthVision":
        result = await v3SynthesizeGrowthVision(body.payload as Parameters<typeof v3SynthesizeGrowthVision>[0]);
        break;
      case "generateVisionDirections":
        result = await v3GenerateVisionDirections(body.payload as Parameters<typeof v3GenerateVisionDirections>[0]);
        break;
      case "generateTimeHorizon":
        result = await v3GenerateTimeHorizon(body.payload as Parameters<typeof v3GenerateTimeHorizon>[0]);
        break;
      case "extractKeyword":
        result = await v3ExtractKeyword(body.payload as Parameters<typeof v3ExtractKeyword>[0]);
        break;
      case "observePattern":
        result = await v3ObservePattern(body.payload as Parameters<typeof v3ObservePattern>[0]);
        break;
      case "writeChapterArticle":
        result = await v3WriteChapterArticle(body.payload as Parameters<typeof v3WriteChapterArticle>[0]);
        break;
      case "writeEditorNote":
        result = await v3WriteEditorNote(body.payload as Parameters<typeof v3WriteEditorNote>[0]);
        break;
      case "writeCoverHeadline":
        result = await v3WriteCoverHeadline(body.payload as Parameters<typeof v3WriteCoverHeadline>[0]);
        break;
      default:
        return NextResponse.json({ error: `unknown task: ${body.task}` }, { status: 400 });
    }
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
