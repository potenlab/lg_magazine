import type { QriusConfig } from "./config";

export type QriusUser = { userid: string };

/**
 * Exchange the one-time AUTH_CODE for the user's info.
 * Per the CNS guide this is a plain POST {code} — no client secret, no token.
 */
export async function exchangeCodeForUser(code: string, cfg: QriusConfig): Promise<QriusUser> {
  if (cfg.mock) {
    return { userid: cfg.mockUserid };
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
  const data = (await res.json()) as Partial<QriusUser>;
  if (!data?.userid) {
    throw new Error("Qrius userinfo response missing userid");
  }
  return { userid: String(data.userid) };
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
