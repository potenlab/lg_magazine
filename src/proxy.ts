import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { QRIUS_SESSION_COOKIE } from "@/lib/qrius/config";
import { verifySession } from "@/lib/qrius/session";

// Next.js 16: this file replaces `middleware.ts`. It gates the WHOLE app —
// every page and API route requires a valid Qrius session. The only paths
// left open are the Qrius auth endpoints themselves, Next.js internals, and
// public/ static assets. The trailing `.*\.[\w]+$` clause excludes any path
// with a file extension (/vision_express, /brand, /fonts, …); without it the
// image optimizer's unauthenticated internal fetch gets 307'd to login and
// images break — even for logged-in users.
export const config = {
  matcher: ["/((?!api/auth/qrius|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Verify the session cryptographically (not just cookie presence) so a
  // forged or expired cookie cannot slip past the gate.
  const token = request.cookies.get(QRIUS_SESSION_COOKIE)?.value;
  const secret = process.env.QRIUS_SESSION_SECRET;
  const session = token && secret ? await verifySession(token, secret) : null;

  if (session) {
    return NextResponse.next();
  }

  // Unauthenticated API calls get a JSON 401 — a 302 would corrupt fetch().
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Unauthenticated page loads bounce through the Qrius login starter,
  // remembering where the user was headed.
  const login = new URL("/api/auth/qrius/login", request.url);
  login.searchParams.set("redirect", `${pathname}${search}`);
  return NextResponse.redirect(login);
}
