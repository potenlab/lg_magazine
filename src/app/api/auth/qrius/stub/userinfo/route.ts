import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * DEV-ONLY stub of the Qrius user-info API.
 * Enabled only when QRIUS_STUB=1 — returns 404 otherwise, so it is inert in
 * production. Mimics the CNS contract: POST {code} -> {userid}.
 */
export async function POST(request: Request) {
  if (process.env.QRIUS_STUB !== "1") {
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

  // The real Qrius returns whatever fields the vendor agreed with CNS.
  // Our client (exchangeCodeForUser) only reads `userid`.
  return NextResponse.json({ userid: "stub-user-001" });
}
