import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, signAdminToken } from "@/lib/adminAuth";

export const runtime = "nodejs";

// W1.2 모의해킹 조치: 인증 실패 횟수 제한.
// IP당 15분 창에서 5회 실패 시 창이 끝날 때까지 429로 차단하고, 매 실패마다
// 1초 지연을 둔다 (brute-force 속도 제한).
// ponytail: per-replica in-memory map — nginx sticky session이 같은 IP를 같은
// replica에 고정하므로 충분. replica 간 공유가 필요해지면 DB/redis로 승격.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// 해시 후 비교 — 길이 누설 없이 상수 시간 비교.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }

  const ip = clientIp(req);
  const now = Date.now();
  const entry = fails.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (!safeEqual(password, expected)) {
    const e = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    e.count += 1;
    fails.set(ip, e);
    if (fails.size > 5000) {
      for (const [k, v] of fails) if (v.resetAt <= now) fails.delete(k);
    }
    console.warn(JSON.stringify({ evt: "admin_login_fail", ip, count: e.count }));
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  fails.delete(ip);
  const token = await signAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}
