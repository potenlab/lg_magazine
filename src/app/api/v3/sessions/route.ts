import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { V3Session } from "@/lib/v3/scenes/types";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/adminAuth";
import { currentUserid } from "@/lib/qrius/currentUser";
import {
  upsertV3Session,
  listV3Sessions,
  deleteV3Sessions,
  deleteV3Session,
  isSupabaseConfigured,
  SessionOwnershipError,
} from "@/lib/v3/session/serverStorage";

export const runtime = "nodejs";

// When Supabase env vars aren't set, the server-side session mirror is simply
// disabled — local play continues working from localStorage. Every handler
// below short-circuits with a 200 + `skipped:true` so the client's
// fire-and-forget POST doesn't generate 500s on every state change.
const SKIPPED_REASON = "supabase_not_configured";

// W5.2 모의해킹 조치: GET(전체 목록)/DELETE(삭제)는 어드민 전용 작업인데
// /api/v3/* 라 proxy의 어드민 게이트 밖에 있었다 — 일반 로그인 사용자가 전체
// 세션 열람/삭제 가능했던 취약점. 여기서 어드민 쿠키를 직접 검증한다.
async function isAdmin(): Promise<boolean> {
  return verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** POST /api/v3/sessions
 *  body: { session: V3Session }
 *  Upserts the session by session.sessionId. Used by V3SessionContext's
 *  debounced auto-save to mirror the localStorage write to Supabase.
 *  W5.2: qrius userid를 소유자로 도장 — 남의 sessionId를 덮어쓰면 403. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: SKIPPED_REASON });
  }
  try {
    const body = (await req.json()) as { session?: V3Session };
    if (!body.session || !body.session.sessionId) {
      return NextResponse.json(
        { error: "missing session or session.sessionId" },
        { status: 400 },
      );
    }
    const userid = await currentUserid();
    const record = await upsertV3Session(body.session, userid);
    return NextResponse.json({ record });
  } catch (err) {
    if (err instanceof SessionOwnershipError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/v3/sessions  → admin list. Returns every v3 session row. */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "admin_unauthenticated" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ records: [], skipped: true, reason: SKIPPED_REASON });
  }
  try {
    const records = await listV3Sessions();
    return NextResponse.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/v3/sessions[?sessionId=...]
 *  Without query: 전체 삭제. With sessionId: 해당 row만 삭제. Admin 전용. */
export async function DELETE(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "admin_unauthenticated" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: SKIPPED_REASON });
  }
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (sessionId) {
      await deleteV3Session(sessionId);
    } else {
      await deleteV3Sessions();
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
