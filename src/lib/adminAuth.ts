// Admin cookie sign/verify — edge-runtime safe (used by src/proxy.ts).
//
// W9.3 모의해킹 조치: 이전 버전은 HMAC(상수 문자열)라 토큰 값이 영구 고정 —
// 한 번 탈취되면 시크릿 교체 전까지 무기한 유효했다. 이제 qrius 세션과 같은
// `payload.sig` 서명 토큰에 만료(exp)를 넣어 8시간 후 자동 파기된다.
// 발급마다 값이 달라지고, 만료 검증은 verifySession 이 수행한다.
// 주의: ADMIN_COOKIE_SECRET 은 QRIUS_SESSION_SECRET 과 반드시 다른 값이어야
// 두 토큰이 상호 위조에 쓰일 수 없다.

import { signSession, verifySession, type QriusSessionPayload } from "@/lib/qrius/session";

const ADMIN_USERID = "__magazine_admin__";
export const ADMIN_COOKIE = "magazine_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8; // 8h — qrius 세션과 동일

export async function signAdminToken(): Promise<string> {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) throw new Error("ADMIN_COOKIE_SECRET is not configured");
  const payload: QriusSessionPayload & { jti: string } = {
    userid: ADMIN_USERID,
    exp: Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE,
    jti: crypto.randomUUID(), // 발급마다 고유 — 같은 초에 로그인해도 토큰이 다르다
  };
  return signSession(payload, secret);
}

export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) return false;
  return (await verifySession(token, secret))?.userid === ADMIN_USERID;
}
