import { NextResponse } from "next/server";
import { isMssqlConfigured } from "@/lib/v3/session/serverStorage";
import { listQriusLogins } from "@/lib/admin/qriusLogins";
import { listCohortRules } from "@/lib/admin/cohortRules";
import { aggregateLogins } from "@/lib/admin/loginStats";

export const runtime = "nodejs";

// proxy.ts 가 /api/admin/* 를 이미 ADMIN_COOKIE 로 게이트한다.
// LG(Qrius) SSO 로그인 통계 — 차수 버킷은 로그인 시각 기준.

export async function GET() {
  if (!isMssqlConfigured()) {
    return NextResponse.json({ skipped: true, reason: "mssql_not_configured" });
  }
  try {
    const [events, rules] = await Promise.all([listQriusLogins(), listCohortRules()]);
    return NextResponse.json({ stats: aggregateLogins(events, rules) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
