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

const USERID_KEYS = [
  "userid", "userId", "user_id", "id",
  "loginId", "login_id", "memberId", "member_id", "empNo", "emp_no",
];
const EMAIL_KEYS = ["email", "mail", "user_email", "userEmail", "emailAddress", "email_address"];
const NAME_KEYS = ["name", "user_name", "userName", "fullname", "fullName", "username"];
// 응답이 {"data": {...}} 같은 envelope 로 감싸져 올 경우 한 단계 벗겨본다.
const WRAPPER_KEYS = ["data", "result", "user", "userinfo", "userInfo", "body", "item"];

/**
 * Exchange the one-time AUTH_CODE for the user's info.
 * Per the CNS guide this is a plain POST {code} — no client secret, no token.
 *
 * CNS 의 실제 응답 필드명 스펙(slide 2)은 미확보. 서버는 실 URL 이 나오기 전까지
 * 자체 스텁({"userid": ""})을 쓰고 있으므로, 어떤 응답이 와도 로그인 자체는
 * 절대 실패시키지 않는다 — id 를 못 찾으면 빈 userid 로 통과시키고 서버 로그에
 * 원본을 남긴다 (admin 적재는 콜백에서 userid 없으면 스킵).
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

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    data = parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Qrius userinfo returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  // envelope 벗기기: 최상위에서 id/email 을 못 찾으면 흔한 wrapper 키 한 단계 안을 본다.
  let payload = data;
  if (!pickString(payload, USERID_KEYS) && !pickString(payload, EMAIL_KEYS)) {
    for (const k of WRAPPER_KEYS) {
      const v = data[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>;
        if (pickString(inner, USERID_KEYS) || pickString(inner, EMAIL_KEYS)) {
          payload = inner;
          break;
        }
      }
    }
  }

  const email = pickString(payload, EMAIL_KEYS);
  // 계정 ID 가 이메일뿐인 응답이면 이메일을 userid 로 쓴다.
  const userid = pickString(payload, USERID_KEYS) ?? email ?? "";
  if (!userid) {
    // 로그인은 통과시키되 실제 응답 모양을 서버 로그로 남겨 필드 매핑에 쓴다.
    console.error("[qrius] userinfo response without recognizable id:", text.slice(0, 500));
  }
  return {
    userid,
    email,
    name: pickString(payload, NAME_KEYS),
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
