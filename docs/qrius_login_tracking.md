# Qrius Login Tracking — Status & Runbook

> **Last updated:** 2026-07-03 (production branch)
> **Purpose:** Track who logs in via LG(Qrius) SSO and show it in the admin panel
> (`/admin` → 로그인 현황 카드) and the Excel export (로그인 sheet).
> Requested by LG (via 이민재/minjae): *"We can see the Email Address in Admin."*

---

## 1. Current status (한눈에)

| Item | Status |
|------|--------|
| Login event recording (`qrius_logins` table) | ✅ deployed |
| Admin 로그인 현황 card (counts, per-차수, user table) | ✅ deployed |
| Excel export 로그인 sheet | ✅ deployed |
| Email / name capture code (parser + storage) | ✅ deployed — **waiting for data** |
| Anonymous counting (`user#N`) while identity unavailable | ✅ implemented (commit `f9f0c79`) |
| **CNS user-info API (returns email/name)** | ❌ **NOT issued by LG CNS — the only blocker** |

**Why the admin shows `user#N` instead of emails:** the server exchanges the SSO
AUTH_CODE against a **placeholder stub** (`/api/auth/qrius/stub/userinfo` → `{"userid":""}`)
because CNS never delivered the real user-info API URL (see
[qrius_oauth_guide.md](qrius_oauth_guide.md) §Slide 2 — "issued by CNS only after the
data scope is agreed (not yet received)"). No identity in → no email out. Everything on
our side is built and tested; the email column fills the moment CNS provides the URL.

## 2. What was built (2026-07-02 ~ 07-03)

1. **`qrius_logins` table** (`supabase/migrations/qrius_logins.mssql.sql`) — one row per
   successful SSO callback: `userid`, `email`, `name`, `raw_json`(userinfo 원본), `logged_in_at`.
   Applied automatically by `deploy.sh` / `redeploy.sh` / `setup-mssql.sh` (IF NOT EXISTS).
2. **Recording** — `src/app/api/auth/qrius/callback/route.ts` fire-and-forgets
   `recordQriusLogin()` (`src/lib/admin/qriusLogins.ts`); a DB failure never blocks login.
3. **Tolerant userinfo parser** — `src/lib/qrius/client.ts` `exchangeCodeForUser()`:
   - unwraps one envelope level (`data`/`result`/`user`/…)
   - tries many key names for id (`userid`,`userId`,`user_id`,`id`,`loginId`,`empNo`,…),
     email (`email`,`mail`,`user_email`,…), name (`name`,`user_name`,…)
   - email-as-userid fallback; keeps the **raw response** so no field is ever lost
   - **never fails the login** — unknown/empty responses log to server console
     (`sudo docker compose logs lg-magazine | grep qrius`) and pass through
4. **Anonymous counting (`user#N`)** — while the stub returns no identity, the callback
   sets a 1-year `qrius_anon` cookie (`anon-<uuid>`), so distinct devices are counted as
   distinct users. Admin/Excel label them `user#1`, `user#2` … in first-login order.
   **Real data, not mock** — one row per actual LG login. Caveats: same person on two
   devices counts twice; cleared cookies start a new `user#N`.
5. **Admin UI** — 로그인 현황 (LG SSO) card in `/admin` sidebar: 등록 N명 · 로그인 M회,
   per-차수 chips (login-time bucketing via cohort rules), user table
   (사용자/이메일/횟수/마지막 로그인). Excel download gained a 로그인 sheet.

Verified: locally against the **real** LG SSO (`www.lgacademy.com` login page, CNS test
account `testQrius1@lgacademy.com`) and with simulated userinfo responses of every
expected shape (flat, enveloped, email-only, empty-stub).

## 3. Blocked on LG CNS — the user-info API

CNS must build/issue the API their own OAuth guide defines (Slide 1 step 9:
"업체가 필요로 하는 정보 (이메일, 이름, 회사 등)"). Spec we sent:

- **Request** (our server → Qrius, server-to-server):
  `POST`, `Content-Type: application/json`, body `{"code": "AUTH_CODE"}`
  (the one-time code Qrius already sends to our `redirect_uri` — that side works today)
- **Response** (HTTP 200): `{"userid": "...", "email": "user@lge.com", "name": "홍길동", "company": "..."}`
  — **required: `userid`, `email`**; other JSON field names are tolerable (parser adapts)
- **Failure:** HTTP 400/401 JSON for invalid/expired code; codes single-use
- Calls originate from the production server `203.247.146.226` (whitelist if applicable)
- A sample response JSON alongside the URL speeds verification

## 4. Activation runbook (when CNS delivers the URL)

On the server — **no rebuild, no tarball**:

```bash
cd ~/lg_magazine
# 1. set the real URL (replace the stub)
sudo sed -i 's|^QRIUS_USERINFO_URL=.*|QRIUS_USERINFO_URL=<CNS-issued URL>|' .env
# 2. restart app replicas only
sudo docker compose up -d --no-deps --force-recreate lg-magazine
# 3. log in once via LG SSO, then check /admin — email should appear.
#    If the email column shows "-", inspect what CNS actually sent:
sudo docker compose logs lg-magazine | grep qrius
# or: SELECT TOP 5 raw_json FROM qrius_logins ORDER BY logged_in_at DESC;
```

If the field names differ from every guess, map them in
`src/lib/qrius/client.ts` (`USERID_KEYS`/`EMAIL_KEYS`/`NAME_KEYS`) — a one-line change.

Optional cleanup once real identities flow (remove anonymous & any demo rows):

```bash
PW=$(grep -E '^MSSQL_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
sudo docker compose exec -T mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$PW" -No -d lg_magazine \
  -Q "DELETE FROM qrius_logins WHERE userid LIKE 'anon-%' OR raw_json = N'{\"dummy\":true}';"
```

## 5. Related

- [qrius_oauth_guide.md](qrius_oauth_guide.md) — CNS OAuth 2.0 contract (transcribed PPTX)
- [production_deployment.md](production_deployment.md) — `QRIUS_USERINFO_URL` listed as
  "the one true go-live blocker" (§env table)
- Commits: `78d607b` (login tracking) → `00971c1` (email capture) → `d0b5d22`
  (tolerant parser / login-never-fails) → `f9f0c79` (anonymous `user#N`)
