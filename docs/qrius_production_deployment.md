# Qrius — Production Deployment Guide

How to take the Qrius login integration live on **https://mybook.lgacademy.com**.

> Companion docs: [qrius_oauth_guide.md](qrius_oauth_guide.md) (the spec),
> the testing modes in [.env.example](../.env.example).

---

## 0. TL;DR

1. Get `QRIUS_USERINFO_URL` from LG CNS — **this is the one true blocker**.
2. Set 5 environment variables in the production environment (Section 3).
3. Make sure `QRIUS_STUB` is **unset** and `QRIUS_MOCK=0`.
4. Build (`output: standalone`), deploy, verify (Section 7).

---

## 1. Prerequisites

| Item | Status |
|---|---|
| Production domain | ✅ `https://mybook.lgacademy.com` |
| TLS / SSL | ✅ configured |
| CNS aware of the domain | ✅ confirmed |
| Qrius login URL | ✅ `https://www.lgacademy.com/login/index.php` |
| Qrius logout URL | ✅ `https://www.lgacademy.com/login/logout.php?isvendor=1` |
| **Qrius user-info API URL** | ❌ **not issued yet — see Section 2** |

Verified against real Qrius from localhost: the login page accepts our
`redirect_uri`, authenticates, and redirects back with `?code=` (a 40-char hex
`AUTH_CODE`). Real Qrius does **not** echo `state` — the callback already
handles that correctly.

---

## 2. The one blocker — the user-info URL

Real login **cannot complete** without `QRIUS_USERINFO_URL`. The flow reaches
the callback with a valid `AUTH_CODE`, but the code-for-user exchange (step 8–9
of the spec) has no endpoint to call → the callback returns `502`.

**Action:** reply to LG CNS (Gil Sanguk / 이혜원):

1. Confirm the **field set** the app needs. The code currently consumes only
   `userid`. Decide if you also need email / name / company — anything beyond
   `userid` must be agreed with the 인화원 보안담당자 first.
2. Confirm the **callback URL** to register:
   `https://mybook.lgacademy.com/api/auth/qrius/callback`
3. CNS then issues the **user-info API URL** → that becomes `QRIUS_USERINFO_URL`.

Until then, you have two choices:

| Choice | Effect |
|---|---|
| **Wait** (recommended) | Don't make the site public until the URL arrives. |
| Launch in `QRIUS_MOCK=1` | ⚠️ Site is up but **everyone is logged in as the same mock user — there is no real access control**. Only do this if the site is not meant to be protected yet. |

---

## 3. Production environment variables

Set these in the **deployment environment** (Docker `environment:` / secret
store / hosting dashboard). **Never commit them to git.**

```bash
# --- Qrius (production / real) ---
QRIUS_MOCK=0
QRIUS_SESSION_SECRET=<unique 64-hex secret — see Section 4>
QRIUS_REDIRECT_URI=https://mybook.lgacademy.com/api/auth/qrius/callback
QRIUS_AUTH_URL=https://www.lgacademy.com/login/index.php
QRIUS_USERINFO_URL=<the URL LG CNS issues>

# QRIUS_STUB must NOT be set in production (leave it out entirely).
```

Plus the app's existing vars (`LLM_PROVIDER` + API keys, `SUPABASE_*`) — see
[.env.example](../.env.example).

| Variable | Notes |
|---|---|
| `QRIUS_MOCK` | `0` in production. `1` = no real auth (Section 2). |
| `QRIUS_STUB` | **Unset.** If set, dev-only stub endpoints become reachable. The stub routes return 404 when it is unset — keep it that way. |
| `QRIUS_SESSION_SECRET` | Signs the session cookie. See Section 4. |
| `QRIUS_REDIRECT_URI` | Must **exactly** match the callback URL registered with CNS. |
| `QRIUS_AUTH_URL` | The fixed CNS login page. |
| `QRIUS_USERINFO_URL` | From CNS. Empty → real login returns 502. |

---

## 4. Security checklist

- [ ] **Generate a fresh production `QRIUS_SESSION_SECRET`** — do not reuse the
      local-dev one. Generate with:
      ```bash
      openssl rand -hex 32
      ```
- [ ] Store the secret in a **secret manager / env store**, not in the repo.
- [ ] **Keep the secret stable.** Changing it invalidates every active session
      (all users are forced to log in again).
- [ ] `QRIUS_STUB` is **not present** in the production environment.
- [ ] `.env.local` / `.env` files with secrets are **git-ignored** (already are).
- [ ] The session cookie is `httpOnly` + `SameSite=Lax`, and `Secure` on HTTPS
      (production is HTTPS → Secure is on). See Section 8 if behind a proxy.
- [ ] Session lifetime is 8 hours (`SESSION_MAX_AGE_SECONDS`) — adjust in
      [src/lib/qrius/config.ts](../src/lib/qrius/config.ts) if needed.

---

## 5. Build & deploy

The app uses `output: "standalone"` ([next.config.ts](../next.config.ts)) — a
self-contained Node.js server bundle.

```bash
npm ci
npm run build      # produces .next/standalone
```

Deploy however the project ships (Docker per the README, or a Node server).

> ⚠️ **Do not use static export** (`output: 'export'`). Static export disables
> the Proxy — which would **turn off the entire auth gate**. The Proxy is
> supported on a Node.js server and in Docker only.

---

## 6. Go-live sequence

1. CNS confirms the field set and issues `QRIUS_USERINFO_URL`.
2. Register `https://mybook.lgacademy.com/api/auth/qrius/callback` with CNS.
3. Set the Section 3 env vars in production (real values, `QRIUS_MOCK=0`,
   no `QRIUS_STUB`).
4. Build and deploy.
5. Run the Section 7 verification.
6. Announce the URL.

---

## 7. Post-deploy verification

After deploy, from a clean browser (incognito):

| Step | Expected |
|---|---|
| Open `https://mybook.lgacademy.com/` | Redirects to the LG Academy login page |
| Log in with a real Qrius account | Lands back on the magazine app |
| `https://mybook.lgacademy.com/api/auth/qrius/me` | `{"authenticated":true,"userid":"<real id>",...}` |
| Reload a page | Loads directly, no re-login (session valid 8h) |
| `https://mybook.lgacademy.com/api/auth/qrius/logout` | Redirects to the Qrius logout URL; `/me` then 401 |

API gate:
```bash
curl -i https://mybook.lgacademy.com/api/v3/sessions   # → 401 unauthenticated
```

If the callback returns **502** → `QRIUS_USERINFO_URL` is wrong or missing.

---

## 8. Behind a reverse proxy (important)

If `mybook.lgacademy.com` terminates TLS at a reverse proxy (nginx / ALB) and
forwards plain HTTP to the app, the app may see requests as `http://` on an
internal host. That can cause:

- the session cookie to be set **without `Secure`**, and
- post-login redirects to target the **internal** host.

**Fix:** forward `X-Forwarded-Proto: https` and `X-Forwarded-Host:
mybook.lgacademy.com` from the proxy to the app. (A code-level hardening that
derives `Secure`/origin from `QRIUS_REDIRECT_URI` instead of the request is
recommended — ask the dev team to apply it before go-live.)

---

## 9. Rollback / fallback

- To disable real Qrius quickly: set `QRIUS_MOCK=1` and redeploy — but note
  this removes real access control (Section 2).
- The integration is isolated: `src/proxy.ts`, `src/lib/qrius/`,
  `src/app/api/auth/qrius/`. Removing the proxy file disables the gate
  entirely (not recommended, but it is the kill switch).

---

## 10. Notes / known behaviors

- **`state` is not used for CSRF.** Real Qrius does not echo `state` (verified).
  The callback verifies it only if present. Residual risk is login-CSRF on an
  internal app — low. Documented, not a blocker.
- **Static assets are also gated.** The Proxy currently runs on `public/`
  assets too. Authenticated users are unaffected; if you want assets served
  without auth, narrow the `matcher` in [src/proxy.ts](../src/proxy.ts).
- **Logout** calls the Qrius logout URL (`?isvendor=1`) as required by CNS.
- **`userid` only.** Until the field set is widened with CNS, the app knows
  the user only by `userid`.
