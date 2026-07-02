import type { QriusConfig } from "./config";

// CNS 스펙 (docs/qrius_oauth_guide.md slide 1, step 9): userinfo 응답은
// "업체가 필요로 하는 정보 (이메일, 이름, 회사 등)". 정확한 필드명 스펙(slide 2)은
// 미확보라 userid 외의 키는 방어적으로 파싱하고, 원본 전체를 raw 로 보존한다.
export type QriusUser = {
  userid: string;
  email: string | null;
  name: string | null;
  /** userinfo 응답 원본 — 필드명이 예상과 달라도 데이터를 잃지 않기 위함. */
  raw: Record<string, unknown>;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Exchange the one-time AUTH_CODE for the user's info.
 * Per the CNS guide this is a plain POST {code} — no client secret, no token.
 */
export async function exchangeCodeForUser(code: string, cfg: QriusConfig): Promise<QriusUser> {
  if (cfg.mock) {
    const email = cfg.mockUserid.includes("@") ? cfg.mockUserid : `${cfg.mockUserid}@mock.local`;
    return { userid: cfg.mockUserid, email, name: cfg.mockUserid, raw: { mock: true } };
  }
  if (!cfg.userinfoUrl) {
    throw new Error("QRIUS_USERINFO_URL not configured (CNS has not issued it yet)");
  }
  const res = await fetch(cfg.userinfoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    throw new Error(`Qrius userinfo failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const userid = pickString(data, ["userid", "userId", "user_id", "id"]);
  if (!userid) {
    throw new Error("Qrius userinfo response missing userid");
  }
  return {
    userid,
    email: pickString(data, ["email", "mail", "user_email", "userEmail", "emailAddress"]),
    name: pickString(data, ["name", "user_name", "userName", "fullname", "fullName"]),
    raw: data,
  };
}

/**
 * Build the Qrius login-page URL.
 * Per the CNS email the contract is:  {authUrl}?redirect_uri={VendorURL}
 * `state` is sent best-effort — Qrius is not documented to echo it back.
 */
export function buildQriusAuthorizeUrl(cfg: QriusConfig, state: string): string {
  if (!cfg.authUrl) {
    throw new Error("QRIUS_AUTH_URL not configured");
  }
  const u = new URL(cfg.authUrl);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}
