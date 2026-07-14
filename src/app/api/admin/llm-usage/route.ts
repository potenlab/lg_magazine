import { NextResponse } from "next/server";
import { isMssqlConfigured } from "@/lib/v3/session/serverStorage";
import { summarizeLlmUsage } from "@/lib/admin/llmUsage";

export const runtime = "nodejs";

// proxy.ts 가 /api/admin/* 를 이미 ADMIN_COOKIE 로 게이트한다.
// LLM 사용량 — userid 별 호출/토큰/추정 비용 집계.

export async function GET() {
  if (!isMssqlConfigured()) {
    return NextResponse.json({ skipped: true, reason: "mssql_not_configured" });
  }
  try {
    return NextResponse.json({ summary: await summarizeLlmUsage() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
