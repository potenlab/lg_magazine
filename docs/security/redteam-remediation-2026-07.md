# RED Team Pentest — Remediation Report (2026-07)

**System:** MVP Vision Express (LG Magazine)
**Pentest window:** 2026-07-02 – 2026-07-06 (3 MD) · RED team: 윤승현 선임
**Findings:** 3 (W1.2, W5.2, W9.3) · **Status: fixed & verified on staging; production branch pushed, on-prem deploy pending**
**Fix commits:** `main` (Supabase) — see PR #13 · `production` (MSSQL) — `08ad7fe`
**Author:** Potenlab `<dev@potenlab.dev>`

---

## Summary

| Code | 취약점 | Severity | What it allowed | Status |
|---|---|---|---|---|
| **W1.2** | 인증 실패 횟수 제한 미존재 | High | Unlimited admin-password brute-force at full speed | ✅ Fixed |
| **W5.2** | 취약한 ACL 정책 및 권한 검증 | **Critical** | Any logged-in user could read **all** users' sessions and delete the entire table | ✅ Fixed |
| **W9.3** | 인증 세션/토큰 부여·파기 정책 미흡 | Medium | Admin cookie was a fixed value, valid forever, no expiry | ✅ Fixed |

> **W5.2 was confirmed live** during remediation: a normal minted user cookie against
> `GET /api/v3/sessions` on production returned every user's full session (names, jobs,
> personal reflection data). This is a data-exposure-grade issue and is the priority fix.

---

## W1.2 — 인증 실패 횟수 제한 미존재 (No login-attempt limit)

**File:** `src/app/api/auth/admin/login/route.ts`

**Before** — the admin login compared the password with a bare `password !== expected`.
No rate limit, no lockout, no delay, and a non-constant-time compare. An attacker with
any logged-in session could brute-force the admin password at wire speed.

**Fix**
- Per-IP failure counter (in-memory `Map`, keyed on `x-forwarded-for`).
- **5 failures within a 15-minute window → `429 Too Many Requests`** with a `Retry-After`
  header, until the window closes.
- **1-second delay on every failed attempt** — throttles automated guessing.
- Password comparison is now **constant-time** (`sha256` digest + `timingSafeEqual`),
  removing the timing side-channel.

**Result:** the 6th wrong attempt from an IP is blocked; guessing goes from minutes to
impractical.

**Note (deployment topology):** the counter is per-replica in memory. Production runs 3
long-lived replicas behind nginx with sticky sessions, so this holds. If a distributed,
IP-rotating attack is in scope, promote the counter to a shared store (nginx `limit_req`
or Redis) as a second layer.

---

## W5.2 — 취약한 ACL 정책 및 권한 검증 (Broken access control)

**Files:** `src/app/api/v3/sessions/route.ts`, `src/lib/v3/session/serverStorage.ts`,
`supabase/migrations/v3_sessions_userid*.sql`

**Before** — `/api/v3/sessions` sat outside the admin gate (`/api/admin/*`), yet exposed
admin-grade operations:
- `GET` returned **every** user's full session data to any logged-in user.
- `DELETE` (no query) let any logged-in user **wipe all sessions** in one request.
- `POST` upserted by client-supplied `sessionId` with **no ownership check** — the table
  had no owner column, so one user could overwrite another's session.

**Fix**
- `GET` and `DELETE` now require the admin cookie via `verifyAdminToken` →
  `401 admin_unauthenticated` otherwise. (Confirmed these are only ever called from the
  admin page; regular players only `POST`.)
- `POST` stamps the **cryptographically verified** qrius `userid` (via the new
  `currentUser.ts` helper) onto the row as its owner.
- The DB write updates a row **only if its existing owner is null or equals the requester**;
  otherwise it rejects → `SessionOwnershipError` → HTTP `403`.
- New `userid` column on `v3_sessions` (idempotent migration, auto-applied by `deploy.sh`).

**Result:** a normal user gets `401` on list/delete; no user can overwrite another's session.

**MSSQL vs Supabase nuance:** on production (MSSQL) the ownership check is atomic inside the
`MERGE` statement. On `main` (Supabase/PostgREST) the same guarantee is a read-then-write
owner check — a small TOCTOU window exists there, documented in-code; production, the
re-verification target, is the atomic one.

---

## W9.3 — 인증 세션/토큰 부여·파기 정책 미흡 (Weak token lifecycle)

**File:** `src/lib/adminAuth.ts`

**Before** — the admin cookie was `HMAC(secret, "magazine-admin-ok")`: the **same value for
every login, forever**, with no embedded expiry (only a 7-day browser `maxAge`). A leaked
cookie granted admin access indefinitely, revocable only by rotating the server secret.

**Fix**
- The cookie is now a **signed payload** `{ userid, exp, jti }`, reusing the existing qrius
  `signSession` / `verifySession` (the hand-rolled fixed HMAC was deleted).
- **8-hour expiry** enforced on verification (matches the user session TTL; was 7 days).
- **Unique `jti` per login** — every issued token is a distinct value.
- Old fixed-value tokens are automatically rejected (admins re-login once after deploy).

**Result:** each login gets a distinct, self-expiring token; a leaked one dies on its own.

**Ops requirement:** `ADMIN_COOKIE_SECRET` **must differ** from `QRIUS_SESSION_SECRET` on the
server, so the two token types can't be used to forge one another.

---

## Verification

**Live on staging** (`lg-magazine.vercel.app`, `main` deploy):
| Check | Result |
|---|---|
| W1.2 — 7 wrong admin logins | `401 ×5 → 429 ×2` ✅ |
| W5.2 — regular-user `GET /api/v3/sessions` | `401 admin_unauthenticated` ✅ (was: all sessions) |
| W5.2 — regular-user `DELETE /api/v3/sessions` | `401 admin_unauthenticated` ✅ (was: wipe-all) |
| unauthenticated request | `401 unauthenticated` (site gate) ✅ |

**Automated self-check** — `scripts/check-adminauth.ts` (run: `bun scripts/check-adminauth.ts`):
sign→verify, expiry, tamper, legacy-token rejection, non-admin payload rejection — all pass.

**Local** — typecheck (`tsc --noEmit`) and production build (`next build`) green on both
branches; runtime smoke test on the built app confirmed the same 401 / 429 / 403 behavior.

---

## Deploy status & remaining step

| Target | Branch | State |
|---|---|---|
| Staging | `main` (Supabase / Vercel) | ✅ Deployed & verified live |
| Production branch | `production` (MSSQL) | ✅ Fix pushed `08ad7fe` |
| Production **server** (`mybook.lgacademy.com`) | on-prem | ⏳ **Deploy pending** — must run on the host |

To deploy production (run **on the LG server**):
```bash
cd ~/lg_magazine && ./deploy.sh     # pulls production, rebuilds, applies the userid migration idempotently
```
The `userid` migration is picked up automatically by `deploy.sh`'s `supabase/migrations/*.mssql.sql` loop.

**Re-verification** (after the server deploy): repeat the W5.2 probe — the same
`GET /api/v3/sessions` with a normal user cookie must flip from `200`-with-data to
`401 admin_unauthenticated`. That flip is the proof the fix is live.

---

## 조치 요약 (RED팀 회신용)

- **W1.2**: 어드민 로그인 실패 IP당 15분 내 5회 초과 시 429 차단 + 매 실패 1초 지연, 비밀번호 상수시간 비교 적용.
- **W5.2**: 세션 목록 조회/삭제 API에 어드민 인증 필수화(미인증 401), 세션 저장 시 소유자(userid) 검증으로 타 사용자 세션 접근·덮어쓰기 차단(403).
- **W9.3**: 어드민 토큰을 만료(8시간)·발급별 고유값 서명 토큰으로 교체(기존 고정 HMAC 폐기), 유효기간 7일→8시간 단축.
- 스테이징 반영·검증 완료, 운영 서버 배포 후 재점검 요청 예정.
