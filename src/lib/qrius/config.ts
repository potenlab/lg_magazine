export const QRIUS_LOGOUT_URL = "https://www.lgacademy.com/login/logout.php?isvendor=1";

export const QRIUS_SESSION_COOKIE = "qrius_session";
export const QRIUS_REDIRECT_COOKIE = "qrius_redirect";
export const QRIUS_STATE_COOKIE = "qrius_state";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type QriusConfig = {
  mock: boolean;
  mockUserid: string;
  authUrl: string | null;
  userinfoUrl: string | null;
  redirectUri: string;
  publicOrigin: string;
  secureCookies: boolean;
  sessionSecret: string;
};

export function readQriusConfig(): QriusConfig {
  const mock = process.env.QRIUS_MOCK === "1";
  const sessionSecret = process.env.QRIUS_SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("QRIUS_SESSION_SECRET missing or too short (min 16 chars)");
  }
  const redirectUri = process.env.QRIUS_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("QRIUS_REDIRECT_URI not set");
  }
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new Error("QRIUS_REDIRECT_URI must be an absolute URL");
  }
  return {
    mock,
    mockUserid: process.env.QRIUS_MOCK_USERID ?? "dev-user",
    // Known from CNS email: https://www.lgacademy.com/login/index.php
    authUrl: process.env.QRIUS_AUTH_URL ?? null,
    // Issued by CNS only after the data scope is agreed — empty until then.
    userinfoUrl: process.env.QRIUS_USERINFO_URL ?? null,
    redirectUri,
    publicOrigin: redirectUrl.origin,
    secureCookies: redirectUrl.protocol === "https:",
    sessionSecret,
  };
}
