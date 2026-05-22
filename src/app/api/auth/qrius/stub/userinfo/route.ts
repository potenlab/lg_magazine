import { NextResponse } from "next/server";

export const runtime = "nodejs";

function stubEnabled() {
  if (process.env.QRIUS_STUB !== "1") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.QRIUS_ALLOW_STUB_IN_PRODUCTION === "1";
}

/**
 * DEV-ONLY stub of the Qrius user-info API.
 * Enabled only when QRIUS_STUB=1 — returns 404 otherwise, so it is inert in
 * production. Mimics the CNS contract: POST {code} -> {userid}.
 */
export async function POST(request: Request) {
  if (!stubEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  let code: string | undefined;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code;
  } catch {
    return NextResponse.json({ error: "stub: invalid json body" }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "stub: missing code" }, { status: 400 });
  }

  // Temporary production stub: Qrius proves the user logged in, but CNS has not
  // issued the real user-info URL yet, so no real user id is available here.
  return NextResponse.json({ userid: "" });
}
