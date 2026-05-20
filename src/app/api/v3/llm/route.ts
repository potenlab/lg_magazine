import { NextResponse } from "next/server";
import { validateBody } from "@/lib/llmInput";
import { runWithMode, type LLMMode } from "@/lib/llm/modeContext";
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

async function dispatch(task: Task, payload: Record<string, unknown>): Promise<unknown> {
  switch (task) {
    case "judgeBranch":
      return v3JudgeBranch(payload as Parameters<typeof v3JudgeBranch>[0]);
    case "reflectShort":
      return v3ReflectShort(payload as Parameters<typeof v3ReflectShort>[0]);
    case "rephraseLight":
      return v3RephraseLight(payload as Parameters<typeof v3RephraseLight>[0]);
    case "comfortReassure":
      return v3ComfortReassure(payload as Parameters<typeof v3ComfortReassure>[0]);
    case "reflectPoetic":
      return v3ReflectPoetic(payload as Parameters<typeof v3ReflectPoetic>[0]);
    case "reflectValues":
      return v3ReflectValues(payload as Parameters<typeof v3ReflectValues>[0]);
    case "reflectStrength":
      return v3ReflectStrength(payload as Parameters<typeof v3ReflectStrength>[0]);
    case "synthesizeStrength":
      return v3SynthesizeStrength(payload as Parameters<typeof v3SynthesizeStrength>[0]);
    case "synthesizeGrowthVision":
      return v3SynthesizeGrowthVision(payload as Parameters<typeof v3SynthesizeGrowthVision>[0]);
    case "generateVisionDirections":
      return v3GenerateVisionDirections(payload as Parameters<typeof v3GenerateVisionDirections>[0]);
    case "generateTimeHorizon":
      return v3GenerateTimeHorizon(payload as Parameters<typeof v3GenerateTimeHorizon>[0]);
    case "extractKeyword":
      return v3ExtractKeyword(payload as Parameters<typeof v3ExtractKeyword>[0]);
    case "observePattern":
      return v3ObservePattern(payload as Parameters<typeof v3ObservePattern>[0]);
    case "writeChapterArticle":
      return v3WriteChapterArticle(payload as Parameters<typeof v3WriteChapterArticle>[0]);
    case "writeEditorNote":
      return v3WriteEditorNote(payload as Parameters<typeof v3WriteEditorNote>[0]);
    case "writeCoverHeadline":
      return v3WriteCoverHeadline(payload as Parameters<typeof v3WriteCoverHeadline>[0]);
    default:
      throw new Error(`unknown task: ${task as string}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as V3LLMBody;
    if (!body.task || !body.payload) {
      return NextResponse.json({ error: "missing task or payload" }, { status: 400 });
    }
    const cap = validateBody(body.payload);
    if (!cap.ok) return NextResponse.json({ error: cap.error }, { status: 400 });

    // URL 모드 헤더 추출 (gem/claude/mix). 헤더 없으면 env 기본값 사용.
    const rawMode = req.headers.get("x-llm-mode");
    const mode: LLMMode =
      rawMode === "gem" || rawMode === "claude" || rawMode === "mix" ? rawMode : null;

    const result = await runWithMode(mode, () => dispatch(body.task, body.payload));
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
