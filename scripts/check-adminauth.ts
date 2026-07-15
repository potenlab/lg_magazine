// Self-check for the W9.3 admin-token change: sign → verify, expiry, tamper,
// legacy-token rejection. Run: bun scripts/check-adminauth.ts
import assert from "node:assert";
import { signAdminToken, verifyAdminToken } from "../src/lib/adminAuth";
import { signSession } from "../src/lib/qrius/session";

process.env.ADMIN_COOKIE_SECRET = "check-secret-0123456789abcdef";

const fresh = await signAdminToken();
assert.equal(await verifyAdminToken(fresh), true, "fresh token must verify");
assert.notEqual(fresh, await signAdminToken(), "tokens must differ per issue (payload nonce via exp/iat)");

// 만료된 토큰 — exp 과거
const expired = await signSession(
  { userid: "__magazine_admin__", exp: Math.floor(Date.now() / 1000) - 10 },
  process.env.ADMIN_COOKIE_SECRET,
);
assert.equal(await verifyAdminToken(expired), false, "expired token must fail");

// 변조 토큰
assert.equal(await verifyAdminToken(fresh.slice(0, -2) + "xx"), false, "tampered token must fail");

// 구버전(고정 HMAC) 토큰 — 형식이 달라 자동 거부
assert.equal(await verifyAdminToken("AbCdEfGh1234"), false, "legacy static token must fail");

// 일반 사용자 세션 토큰을 어드민 쿠키로 재사용 시도 — userid 불일치로 거부
const userToken = await signSession(
  { userid: "loadtest-00001", exp: Math.floor(Date.now() / 1000) + 3600 },
  process.env.ADMIN_COOKIE_SECRET,
);
assert.equal(await verifyAdminToken(userToken), false, "non-admin payload must fail");

console.log("check-adminauth: all assertions passed");
