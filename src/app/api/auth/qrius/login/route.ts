import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  QRIUS_REDIRECT_COOKIE,
  QRIUS_SESSION_COOKIE,
  QRIUS_STATE_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readQriusConfig,
} from "@/lib/qrius/config";
import { buildQriusAuthorizeUrl } from "@/lib/qrius/client";
import { buildSessionPayload, signSession } from "@/lib/qrius/session";

export const runtime = "nodejs";

// Entry point for an unauthenticated user. In mock mode it mints a session
// immediately; in real mode it bounces the user to the Qrius login page.
export async function GET(request: Request) {
  const cfg = readQriusConfig();
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") ?? "/";
  const cookieStore = await cookies();
  const secure = url.protocol === "https:";

  if (cfg.mock) {
    const token = await signSession(buildSessionPayload(cfg.mockUserid), cfg.sessionSecret);
    cookieStore.set(QRIUS_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return NextResponse.redirect(new URL(redirectTo, url.origin));
  }

  const state = crypto.randomUUID();
  cookieStore.set(QRIUS_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 600,
  });
  cookieStore.set(QRIUS_REDIRECT_COOKIE, redirectTo, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(buildQriusAuthorizeUrl(cfg, state));
}
