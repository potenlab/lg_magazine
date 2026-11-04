import { NextResponse } from "next/server";
import { currentUserid } from "@/lib/qrius/currentUser";
import type { Task } from "../route";

export const runtime = "nodejs";

// POST /api/v3/llm/fallback — the browser reports that it showed canned stub
// text instead of a real AI answer. Sent with navigator.sendBeacon, so the body
// may arrive as text/plain or application/json; either way it is JSON:
//   { task: string, reason: string, sceneId?: string }
// Logs one line {"evt":"llm_fallback",...} and returns 204. Behind the session
// gate in src/proxy.ts like every other /api route.

const MAX_BODY_BYTES = 2048;
const MAX_FIELD = 200;

// Record<Task, true> makes tsc fail if this list drifts from route.ts.
const KNOWN_TASKS: Record<Task, true> = {
  judgeBranch: true,
  reflectShort: true,
  rephraseLight: true,
  comfortReassure: true,
  reflectPoetic: true,
  reflectValues: true,
  reflectStrength: true,
  synthesizeStrength: true,
  synthesizeGrowthVision: true,
  generateVisionDirections: true,
  generateJobTrendCards: true,
  generateTimeHorizon: true,
  extractKeyword: true,
  observePattern: true,
  writeChapterArticle: true,
  writeEditorNote: true,
  writeCoverHeadline: true,
};

function isKnownTask(v: unknown): v is Task {
  return typeof v === "string" && Object.hasOwn(KNOWN_TASKS, v);
}

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const { task, reason, sceneId } = body as Record<string, unknown>;
  if (!isKnownTask(task)) {
    return NextResponse.json({ error: "unknown task" }, { status: 400 });
  }
  if (typeof reason !== "string") {
    return NextResponse.json({ error: "missing reason" }, { status: 400 });
  }

  const userid = await currentUserid().catch(() => null);
  console.log(
    JSON.stringify({
      evt: "llm_fallback",
      task,
      reason: reason.slice(0, MAX_FIELD),
      sceneId: typeof sceneId === "string" ? sceneId.slice(0, MAX_FIELD) : null,
      userid,
    }),
  );
  return new Response(null, { status: 204 });
}
