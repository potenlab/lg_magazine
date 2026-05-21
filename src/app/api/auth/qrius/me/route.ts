import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { QRIUS_SESSION_COOKIE, readQriusConfig } from "@/lib/qrius/config";
import { verifySession } from "@/lib/qrius/session";

export const runtime = "nodejs";

// Lightweight endpoint for the client to check the current session.
export async function GET() {
  const cfg = readQriusConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(QRIUS_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const payload = await verifySession(token, cfg.sessionSecret);
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    userid: payload.userid,
    expiresAt: payload.exp,
  });
}
