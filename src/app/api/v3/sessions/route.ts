import { NextResponse } from "next/server";
import type { V3Session } from "@/lib/v3/scenes/types";
import { upsertV3Session, listV3Sessions, deleteV3Sessions } from "@/lib/v3/session/serverStorage";

export const runtime = "nodejs";

/** POST /api/v3/sessions
 *  body: { session: V3Session }
 *  Upserts the session by session.sessionId. Used by V3SessionContext's
 *  debounced auto-save to mirror the localStorage write to Supabase. */
export async function POST(req: Request) {
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
  try {
    const records = await listV3Sessions();
    return NextResponse.json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/v3/sessions  → admin "clear all" affordance. */
export async function DELETE() {
  try {
    await deleteV3Sessions();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
