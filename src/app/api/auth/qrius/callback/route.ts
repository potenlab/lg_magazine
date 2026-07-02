import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  QRIUS_REDIRECT_COOKIE,
  QRIUS_SESSION_COOKIE,
  QRIUS_STATE_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  readQriusConfig,
} from "@/lib/qrius/config";
import { exchangeCodeForUser } from "@/lib/qrius/client";
import { buildSessionPayload, signSession } from "@/lib/qrius/session";
import { redirectUrlForApp } from "@/lib/qrius/url";
import { isMssqlConfigured } from "@/lib/v3/session/serverStorage";
import { recordQriusLogin } from "@/lib/admin/qriusLogins";

export const runtime = "nodejs";

// Qrius redirects the browser here as {redirect_uri}?code=AUTH_CODE.
// We exchange the code for the user, then mint our own signed session.
export async function GET(request: Request) {
  const cfg = readQriusConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();

  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  // Per the CNS spec Qrius redirects back with only `?code=` and is not
  // documented to echo `state`. We therefore only enforce the CSRF check
  // when a `state` value actually comes back.
  if (!cfg.mock && state) {
    const expectedState = cookieStore.get(QRIUS_STATE_COOKIE)?.value;
    if (!expectedState || expectedState !== state) {
      return NextResponse.json({ error: "state_mismatch" }, { status: 400 });
    }
  }

  let user;
  try {
    user = await exchangeCodeForUser(code, cfg);
  } catch (err) {
    const message = err instanceof Error ? err.message : "exchange_failed";
    return NextResponse.json({ error: "userinfo_failed", detail: message }, { status: 502 });
  }

  // 로그인 이벤트 적재 (admin 통계용 — userid/email/name + raw 원본).
  // 실패해도 로그인은 계속되어야 한다.
  if (isMssqlConfigured()) {
    recordQriusLogin(user).catch((err) => {
      console.error("[qrius] login log failed:", err);
    });
  }

  const token = await signSession(buildSessionPayload(user.userid), cfg.sessionSecret);
  cookieStore.set(QRIUS_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.secureCookies,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  cookieStore.delete(QRIUS_STATE_COOKIE);

  const redirectTo = cookieStore.get(QRIUS_REDIRECT_COOKIE)?.value ?? "/";
  cookieStore.delete(QRIUS_REDIRECT_COOKIE);

  return NextResponse.redirect(redirectUrlForApp(redirectTo, cfg));
}
