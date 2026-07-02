import { NextResponse } from "next/server";
import {
  listCohortRules,
  upsertCohortRule,
  deleteCohortRule,
} from "@/lib/admin/cohortRules";

export const runtime = "nodejs";

// proxy.ts 가 /api/admin/* 를 이미 ADMIN_COOKIE 로 게이트한다. 그래서 여기서는
// Supabase 미설정만 방어하면 된다.

function supabaseReady(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const SKIPPED = { rules: [], skipped: true, reason: "supabase_not_configured" };

export async function GET() {
  if (!supabaseReady()) return NextResponse.json(SKIPPED);
  try {
    const rules = await listCohortRules();
    return NextResponse.json({ rules });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!supabaseReady()) return NextResponse.json({ skipped: true });
  try {
    const body = (await req.json()) as {
      name?: string;
      startAt?: string;
      endAt?: string;
    };
    if (!body.name || !body.startAt || !body.endAt) {
      return NextResponse.json(
        { error: "name / startAt / endAt are required" },
        { status: 400 },
      );
    }
    const rule = await upsertCohortRule({
      name: body.name,
      startAt: body.startAt,
      endAt: body.endAt,
    });
    return NextResponse.json({ rule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!supabaseReady()) return NextResponse.json({ skipped: true });
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteCohortRule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
