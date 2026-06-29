import { NextResponse } from "next/server";
import type { V3Session } from "@/lib/v3/scenes/types";
import {
  upsertV3Session,
  listV3Sessions,
  deleteV3Sessions,
  deleteV3Session,
  isMssqlConfigured,
} from "@/lib/v3/session/serverStorage";

export const runtime = "nodejs";

// When MSSQL env vars aren't set, the server-side session mirror is simply
// disabled — local play continues working from localStorage. Every handler
// below short-circuits with a 200 + `skipped:true` so the client's
// fire-and-forget POST doesn't generate 500s on every state change.
const SKIPPED_REASON = "mssql_not_configured";

/** POST /api/v3/sessions
 *  body: { session: V3Session }
 *  Upserts the session by session.sessionId. Used by V3SessionContext's
 *  debounced auto-save to mirror the localStorage write to MSSQL. */
export async function POST(req: Request) {
  if (!isMssqlConfigured()) {
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
    const record = await upsertV3Session(body.session);
    return NextResponse.json({ record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/v3/sessions  → admin list. Returns every v3 session row. */
export async function GET() {
  if (!isMssqlConfigured()) {
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
 *  Without query: 전체 삭제. With sessionId: 해당 row만 삭제. */
export async function DELETE(req: Request) {
  if (!isMssqlConfigured()) {
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
