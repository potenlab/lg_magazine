# Production Deployment Runbook — mybook.lgacademy.com

Self-contained deploy + verify + rollback runbook for the LG Academy Korean
magazine (Next.js 16, `output: "standalone"`), served at
**https://mybook.lgacademy.com**.

> **Audience:** an automation agent (Codex) running **on the production VM**.
> Run commands literally, top to bottom. Every section has a verification GATE —
> **do not continue past a failed gate; report it.**
>
> **Single source of truth:** `scripts/deploy.sh` and the other repo scripts are
> canonical. Where this runbook and any older note disagree, the scripts win.
>
> **Surviving cross-links (still in `docs/`, may be opened for detail):**
> [`cold_load_baseline.md`](cold_load_baseline.md) (expected cold-visit weight),
> [`network_bandwidth_envelope.md`](network_bandwidth_envelope.md) (why the asset
> diet matters), [`qrius_oauth_guide.md`](qrius_oauth_guide.md) (auth spec).
> Qrius production env/auth is in §0b of this runbook.

---

## 0. TL;DR — one-page deploy

The minimal happy path on the VM. `BRANCH` is whatever is being deployed
(currently `asset-diet-and-compression`; after merge it is `main`).

```bash
cd /path/to/lg_magazine                # repo checkout on the production VM
BRANCH=asset-diet-and-compression      # or: main

# 1. Pull the target branch (deploy.sh does NOT pull — you do it here).
git fetch origin
git checkout "$BRANCH"
git pull --ff-only
#    GATE: `git log -1 --oneline` is the commit you intend to ship.

# 2. Run the canonical deploy: build → extract assets → precompress →
#    restart 3 replicas → reload nginx. (Honors COMPOSE_PROJECT_NAME / ASSET_DEST / IMAGE.)
./scripts/deploy.sh
#    GATE: ends with "done"; the `docker compose ... ps` it prints shows
#          3 × lg-magazine "Up (healthy)".

# 3. Verify (full set in §6). Two fast gates:
/usr/bin/curl -sI https://mybook.lgacademy.com/ | head -1
#    GATE: HTTP/2 307 (redirect to Qrius login = app alive behind nginx).
/usr/bin/curl -sI https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.jpg \
  | grep -iE '^(HTTP|Content-Type|X-Asset-Source)'
#    GATE: 200 · image/jpeg · X-Asset-Source: nginx-disk  (NOT 400 — see §4).
```

If any gate fails → §5 (diagnostics) or §7 (rollback).

**Prerequisites (one-time host setup, persist across deploys):** Docker +
Compose v2.20+, nginx with `http_gzip_static_module`, optionally `nginx-extras`
(brotli) and the `brotli` CLI, the nginx config in §3 live on the host, and a
production `.env` (§0b). `deploy.sh` uses `sudo` automatically when not root.

---

## 0b. Qrius auth / environment — set ONCE before the first deploy

The app is gated by Qrius SSO (LG Academy login). These env vars must be live in
the production environment (Docker Compose `environment:` / `.env` read by
`docker compose up -d`, shared by all 3 replicas). **Never commit them.**
Spec detail: [`qrius_oauth_guide.md`](qrius_oauth_guide.md).

```bash
QRIUS_MOCK=0                                                   # 1 = NO real auth (everyone = same mock user)
QRIUS_SESSION_SECRET=<unique 64-hex — `openssl rand -hex 32`>  # signs the session cookie; keep STABLE
QRIUS_REDIRECT_URI=https://mybook.lgacademy.com/api/auth/qrius/callback
QRIUS_AUTH_URL=https://www.lgacademy.com/login/index.php
QRIUS_USERINFO_URL=<issued by LG CNS>                          # empty/wrong → callback returns 502
# QRIUS_STUB must NOT be set (its presence exposes dev stub endpoints).
```
Plus the app's existing `LLM_PROVIDER` + API keys and `SUPABASE_*` (see
[`.env.example`](../.env.example)).

| Rule | Why |
|---|---|
| `QRIUS_MOCK=0` in prod | `1` disables real access control — only for an unprotected preview. |
| `QRIUS_STUB` unset | If set, dev-only stub auth routes become reachable. |
| `QRIUS_SESSION_SECRET` stable + per-secret-store | Changing it logs every active user out. Don't reuse the dev one. |
| `QRIUS_REDIRECT_URI` exact match | Must equal the callback URL registered with CNS. |
| `QRIUS_USERINFO_URL` from CNS | The one true go-live blocker — without it real login can't complete (502). |

> **Reverse-proxy note:** nginx terminates TLS and forwards plain HTTP, so it
> MUST send `X-Forwarded-Proto: https` and `X-Forwarded-Host:
> mybook.lgacademy.com` (already in the §3b `location /` block) — otherwise the
> session cookie loses `Secure` and post-login redirects target the internal
> host. Build is `output: "standalone"`; **never** use `output: 'export'` (it
> disables the proxy and the entire auth gate).

**Auth verification (after deploy, from a clean/incognito browser + curl):**
```bash
# 1. Landing redirects to the LG Academy login page (app alive + gate on).
/usr/bin/curl -sI https://mybook.lgacademy.com/ | grep -iE 'HTTP|location'
#    GATE: 307 → www.lgacademy.com/login

# 2. API is gated.
/usr/bin/curl -si https://mybook.lgacademy.com/api/v3/sessions | head -1
#    GATE: 401 unauthenticated

# 3. After logging in with a real Qrius account, /me returns the user.
#    https://.../api/auth/qrius/me → {"authenticated":true,"userid":"<real id>",...}
#    A 502 on callback → QRIUS_USERINFO_URL missing/wrong.
```

---

## 1. What `scripts/deploy.sh` actually does

Read it before trusting any prose. The real sequence (no `git pull` inside it):

```text
1. cd to repo root
2. docker compose -p $PROJECT build              # builds image lg-magazine:latest
3. DEST=$ASSET_DEST ./scripts/extract-assets.sh  # copy static out of image to host
4. ./scripts/precompress-assets.sh "$ASSET_DEST/_next/static" "$ASSET_DEST"
5. docker compose -p $PROJECT up -d  ; sleep 45 ; docker compose -p $PROJECT ps
6. nginx -t  &&  systemctl reload nginx
```

### Environment variables it honors

| Var | Default | Used by | Meaning |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | `potenlab` | `deploy.sh` (`-p`) | Compose project name for build/up/ps |
| `ASSET_DEST` | `/var/www/lg_magazine_public` | `deploy.sh`, `extract-assets.sh` (`DEST`) | Host dir nginx serves assets from |
| `IMAGE` | `lg-magazine:latest` | `extract-assets.sh` | Image to copy static assets out of |
| `OWNER` | `nginx:nginx` | `extract-assets.sh` | chown target for the served files |

To override, prefix the call, e.g. `ASSET_DEST=/var/www/lg_magazine_public COMPOSE_PROJECT_NAME=potenlab ./scripts/deploy.sh`.

### `extract-assets.sh` — exact behavior (defines the host layout)

- `docker create $IMAGE` → copies `/app/public/.` and `/app/.next/static/.`
  into a temp dir, `chown -R nginx:nginx`, then:
  - `rsync -a --delete --exclude "_next/"  $TMP/public/  $DEST/`
    → `public/` contents land at the **`$DEST` root** (so `vision_express/`,
    `brand/`, `fonts/` are at `$DEST/vision_express/`, **not** `$DEST/public/...`).
  - `rsync -a --delete  $TMP/_next/static/  $DEST/_next/static/`
- Prints `du -sh $DEST $DEST/_next/static`.

> **Reconciled truth (host paths):** the canonical served root is
> **`/var/www/lg_magazine_public`** (underscore). Assets sit at
> `…/vision_express/`, `…/brand/`, `…/fonts/`, `…/_next/static/` — there is **no
> `/public/` subdirectory** on the host. The nginx `alias` paths in §3 reflect
> this. (Older notes used `/var/www/lg-magazine/public/...` — that path is wrong
> for the current scripts; do not use it.)

### `precompress-assets.sh` — exact behavior

- Called by `deploy.sh` with explicit dirs `"$ASSET_DEST/_next/static"` and
  `"$ASSET_DEST"`.
- For `*.js *.css *.svg *.json *.txt *.map` ≥ 1 KB it writes `.gz` (`gzip -9 -k -n`)
  and, if `brotli` is installed, `.br` (`brotli -q 11`) siblings. Skips `.woff2`
  (already compressed) and small files. JPEG/PNG/MP3 are not targeted — already
  compressed, so they are correctly left alone.
- These `.gz`/`.br` files are build artifacts, regenerated each deploy; they are
  git-ignored (`.gitignore` lines 75–79). nginx serves them via `gzip_static` /
  `brotli_static` with zero per-request CPU.

> `precompress-assets.sh` has a fallback path (`/var/www/lg-magazine`) used only
> when called with **no** arguments. `deploy.sh` always passes explicit args, so
> the fallback never fires in production. Ignore it.

---

## 2. Build / image facts (from Dockerfile & docker-compose.yml)

- **Image:** `lg-magazine:latest`, multi-stage `node:22-bookworm-slim`,
  `npm ci` (package manager is **npm** — `package-lock.json` is canonical;
  `bun.lock` is git-ignored, do not use bun).
- **Replicas:** `docker-compose.yml` declares `deploy.replicas: 3`, port range
  `127.0.0.1:3002-3004:3000`, `restart: unless-stopped`, 2 GiB mem limit each.
- **Healthcheck (baked into image):** every 20s, `GET /api/auth/qrius/me`,
  healthy when status < 500 (401 unauthenticated counts as healthy).
- The container listens on `:3000`; Compose maps each replica to one of
  `3002/3003/3004` on loopback. nginx load-balances those three (§3).

---

## 3. HOST nginx configuration (deploy-critical, one-time, persists across deploys)

These blocks live on the **host**, NOT in the Docker image. `deploy.sh` only
runs `nginx -t && systemctl reload nginx`; it never writes nginx config. Set
these up once; they survive every redeploy. After editing, always
`sudo nginx -t && sudo systemctl reload nginx`.

Find the server block for the domain:

```bash
sudo grep -RlE "mybook\.lgacademy\.com" /etc/nginx/
```

### 3a. Upstream — 3 replicas, round-robin (file: `/etc/nginx/conf.d/lg-magazine-upstream.conf`)

```nginx
# Load-balances the 3 app replicas. Round-robin is safe — the app is stateless
# (sessions are HMAC cookies, persistent data is in Supabase).
upstream lg_magazine {
    server 127.0.0.1:3002 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3004 max_fails=3 fail_timeout=15s;
    keepalive 64;          # reuse upstream connections, no TCP handshake per request
}
```

### 3b. The `server { }` block for mybook.lgacademy.com

Inside `server { listen 443 ssl …; server_name mybook.lgacademy.com; … }`,
place the static `location ^~` blocks **ABOVE** `location /`. The `^~` prefix
priority makes them win over `location /` and bypass regex matches.

```nginx
# ---- IN-HOUSE CDN: static assets served from disk, Node never sees them ----
# alias paths point at the script-true host layout: $ASSET_DEST is
# /var/www/lg_magazine_public and assets sit at its ROOT (no /public/ subdir).

# Next.js content-hashed bundles + next/font subset woff2 under media/. Immutable.
location ^~ /_next/static/ {
    alias /var/www/lg_magazine_public/_next/static/;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Asset-Source "nginx-disk" always;
    expires 1y;
    try_files $uri =404;                   # do NOT fall through to Node
    gzip_static on;                        # serve .gz sibling if present
    brotli_static on;                      # serve .br sibling (needs nginx-extras)
}

# Media: jpg / mp3 under vision_express/. Stable names (not content-hashed).
# webp/avif are NOT used here — LG WAF returns HTTP 400 on those extensions (§4).
location ^~ /vision_express/ {
    alias /var/www/lg_magazine_public/vision_express/;
    access_log off;
    add_header Cache-Control "public, max-age=2592000" always;   # 30d
    add_header X-Asset-Source "nginx-disk" always;
    expires 30d;
    try_files $uri =404;
    sendfile on;
    tcp_nopush on;
    aio threads;                           # offload disk reads to thread pool
    output_buffers 2 1m;
}

# Brand SVGs — tiny, change rarely; benefit from gzip/brotli.
location ^~ /brand/ {
    alias /var/www/lg_magazine_public/brand/;
    access_log off;
    add_header Cache-Control "public, max-age=604800" always;    # 7d
    add_header X-Asset-Source "nginx-disk" always;
    expires 7d;
    try_files $uri =404;
    gzip_static on;
    brotli_static on;
}

# Fonts — /fonts/v3/*.ttf are react-pdf-only (not loaded on page view), but
# this block serves them cheaply when a PDF export requests them. Immutable.
location ^~ /fonts/ {
    alias /var/www/lg_magazine_public/fonts/;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header Access-Control-Allow-Origin "*" always;
    add_header X-Asset-Source "nginx-disk" always;
    expires 1y;
    try_files $uri =404;
    types {
        font/woff2  woff2;
        font/woff   woff;
        font/ttf    ttf;
        font/otf    otf;
    }
}

# favicon.ico — harmless if absent (this repo ships none at public root → 404).
location = /favicon.ico {
    alias /var/www/lg_magazine_public/favicon.ico;
    access_log off;
    add_header Cache-Control "public, max-age=604800" always;
    try_files $uri =404;
}
# ---- END IN-HOUSE CDN ----

# Everything else (SSR HTML, /api/*, /_next/image optimizer) → Node replicas.
location / {
    proxy_pass http://lg_magazine;            # the upstream from 3a — NOT a single port
    proxy_http_version 1.1;
    proxy_set_header Connection "";            # required for upstream keepalive
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;                 # keeps cookie Secure + auth redirects correct
    proxy_set_header X-Forwarded-Host  mybook.lgacademy.com;
}
```

> **Do NOT** add a `location ~* \.(js|css|woff2|...)$` regex block — a blanket
> extension match also catches `/api/*` and dynamic paths. The explicit `^~`
> prefixes above are correct and match what `src/proxy.ts` already treats as
> public.
> **Do NOT** add a `location ^~ /_next/image/` block — the image optimizer is
> dynamic and must keep proxying to Node.

### 3c. Global gzip + connection tuning (file: `/etc/nginx/nginx.conf`)

```nginx
worker_processes      auto;
worker_rlimit_nofile  65536;       # was the "too many open files" cause under load

events {
    worker_connections 4096;       # raised; default ~768/1024 collapsed at 1000 users
}

http {
    gzip              on;
    gzip_vary         on;
    gzip_min_length   1024;
    gzip_comp_level   5;
    gzip_proxied      any;
    gzip_types        text/plain text/css text/xml application/json
                      application/javascript application/xml+rss
                      application/atom+xml image/svg+xml font/ttf font/otf;
    # Do NOT add woff2 — already compressed.

    # If nginx-extras (ngx_brotli) is installed, also:
    # brotli            on;
    # brotli_static     on;
    # brotli_comp_level 5;
}
```

---

## 4. Asset reality + WAF constraint (keep this in mind always)

- **LG's WAF returns HTTP 400 on `.webp` AND `.avif` by URL extension**
  (`.png`/`.jpg`/`.gif` pass). All chapter backgrounds are therefore `.jpg`
  (33 files, quality 85 progressive; commit `ac9c70d`) and audio is `.mp3`.
  **NEVER reintroduce `.webp` or `.avif`** — real users would get 400s. If a new
  image arrives in a blocked format, convert it (`scripts/convert-avif-to-jpeg.sh`)
  before committing.
- **Fonts, two readers:** the in-page web fonts are subset woff2 emitted by
  `next/font` to `/_next/static/media/*` — covered by the `/_next/static/`
  immutable rule (NOT `/fonts/`). `/fonts/v3/*.ttf` is downloaded **only** by the
  react-pdf export path, never on page load; the `/fonts/` block serves it when
  needed.
- `.jpg` files **are** committed (`.gitignore` lines 43–47 explicitly allow them;
  only `background_backup/` and `backup/` subdirs are ignored). `.gz`/`.br`
  siblings are git-ignored build artifacts (lines 75–79).

| Path prefix | Format(s) | nginx cache | Served by |
|---|---|---|---|
| `/_next/static/` (incl. `media/*.woff2`) | js, css, woff2, map | `immutable, max-age=1y` | nginx-disk |
| `/vision_express/` | jpg, mp3 | `max-age=30d` | nginx-disk |
| `/brand/` | svg | `max-age=7d` | nginx-disk |
| `/fonts/v3/` | ttf, woff2 (react-pdf only) | `immutable, max-age=1y` | nginx-disk |
| `/_next/image?...` | optimized images | dynamic | **Node** |
| `/`, `/api/*`, SSR | HTML, JSON | dynamic | **Node** |

Expected cold-visit weight target: ~2–4 MB (post-diet, brotli) vs ~5–10 MB
before. Baseline reference: [`cold_load_baseline.md`](cold_load_baseline.md).

---

## 5. 3-replica rollout + diagnostics

`deploy.sh` already runs `docker compose up -d` (which applies `replicas: 3`).
Use this section when a deploy comes up wrong — symptom is usually **latency
improved but error rate up**, the signature of nginx/upstream routing not
steady (not CPU saturation).

### 5a. Diagnostic gates (collect output first, change nothing yet)

```bash
cd /path/to/lg_magazine
PROJECT="${COMPOSE_PROJECT_NAME:-potenlab}"

# Q1 — 3 replicas running and healthy?
sudo docker compose -p "$PROJECT" ps
#   3 rows, "Up (healthy)".  1 row → [A1].  "(unhealthy)"/"(starting)" → [A4].

# Q2 — every replica answers locally?
for p in 3002 3003 3004; do
  echo -n "port $p: "
  curl -s -o /dev/null -w "%{http_code} in %{time_total}s\n" http://127.0.0.1:$p/api/auth/qrius/me
done
#   each "401 in <0.5s".  refused → replica down [A1/A4].  hangs → [A4].

# Q3 — upstream block loaded?
sudo nginx -T 2>/dev/null | grep -A6 "upstream lg_magazine"
#   3 server lines + keepalive.  empty / 1 server → [A2].

# Q4 — public server block uses the upstream?
sudo grep -RhE "proxy_pass" /etc/nginx/conf.d/ /etc/nginx/nginx.conf 2>/dev/null | grep -v '^\s*#'
#   want: proxy_pass http://lg_magazine;   see http://127.0.0.1:3002 → [A3].

# Q5 — clues in the error log?
sudo tail -100 /var/log/nginx/error.log
#   "no live upstreams" / "upstream timed out" → [A1/A4];
#   "worker_connections are not enough" / "too many open files" → [A5].
```

### 5b. Fix branches (apply only what the diagnostic points to; re-run §5a after)

- **[A1] Only 1 replica** — Compose ignored `deploy.replicas` (older versions /
  non-swarm). Force-scale:
  ```bash
  sudo docker compose -p "$PROJECT" up -d --scale lg-magazine=3
  sleep 60 && sudo docker compose -p "$PROJECT" ps     # GATE: 3 × healthy
  ```
- **[A2] Upstream missing** — recreate `/etc/nginx/conf.d/lg-magazine-upstream.conf`
  from §3a, then `sudo nginx -t && sudo systemctl reload nginx`.
- **[A3] proxy_pass on a single port** — edit the server block's `location /` to
  `proxy_pass http://lg_magazine;` plus `proxy_http_version 1.1;` and
  `proxy_set_header Connection "";` (§3b), keep the `X-Forwarded-*` headers, then
  reload nginx.
- **[A4] Healthcheck flapping** — loosen in the Dockerfile and rebuild:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/auth/qrius/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
  ```
  then `./scripts/deploy.sh` (or `docker compose -p "$PROJECT" build && up -d`),
  wait 90s, confirm 3 × healthy stable > 60s.
- **[A5] Connection limits** — apply the `worker_rlimit_nofile` /
  `worker_connections` tuning from §3c, then reload nginx.

**Capacity model:** 1 replica ≈ 300 users; 3 replicas ≈ 900–1,000; 3 replicas +
the in-house nginx CDN (§3) ≈ 1,400–1,600; + asset diet roughly doubles users
per fixed bandwidth. The CPU bottleneck is byte-streaming on the single-threaded
Node process — moving static bytes to nginx is what unlocks the headroom.

---

## 6. Verification gates after deploy

Run in order. Use **absolute `/usr/bin/curl`** for the alive check to dodge any
shell wrapper/alias that mangles the request.

```bash
# 6a. Production alive (proxy → Node works).
/usr/bin/curl -sI https://mybook.lgacademy.com/ | head -1
#    GATE: HTTP/2 307 (redirect to Qrius login).

# 6b. _next/static served from disk with immutable cache.
ASSET="$(/usr/bin/curl -s https://mybook.lgacademy.com/ | grep -oE '/_next/static/[^"]+\.js' | head -1)"
/usr/bin/curl -sI "https://mybook.lgacademy.com${ASSET}" \
  | grep -iE '^(HTTP|Cache-Control|X-Asset-Source)'
#    GATE: 200 · Cache-Control: public, max-age=31536000, immutable · X-Asset-Source: nginx-disk
#    (If the page is auth-gated and the grep finds nothing, pull a chunk name from
#     `docker logs` or the local build's .next/static and test that path directly.)

# 6c. JS bundle is compressed (gzip min; brotli if nginx-extras).
/usr/bin/curl -sI "https://mybook.lgacademy.com${ASSET}" -H "Accept-Encoding: br, gzip" \
  | grep -iE '^(HTTP|Content-Encoding|Content-Length)'
#    GATE: Content-Encoding: br (or gzip) · Content-Length well below the raw .js size.

# 6d. Chapter background as JPEG — proves the WAF bypass (§4).
/usr/bin/curl -sI https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.jpg \
  | grep -iE '^(HTTP|Content-Type|Content-Length|X-Asset-Source)'
#    GATE: 200 · image/jpeg · X-Asset-Source: nginx-disk · NOT 400.

# 6e. Old webp/avif URLs must 404 (file gone) — NOT 400 (WAF).
TS=$(date +%s)
for ext in webp avif; do
  echo -n "Chapter_01-2.$ext → "
  /usr/bin/curl -s -o /dev/null -w "%{http_code}\n" \
    "https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.$ext?_=$TS"
done
#    GATE: 404 for both (files deleted). 400 would mean a stray webp/avif still ships.

# 6f. Audio served from disk at diet size.
/usr/bin/curl -sI https://mybook.lgacademy.com/vision_express/kokoreli777-inside-old-train-169418.mp3 \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source)'
#    GATE: 200 · X-Asset-Source: nginx-disk · Content-Length ~2.7 MB.
```

### 6g. k6 load test against production

Scripts live in `loadtest/`. The realistic per-VU browse flow is
`loadtest/realistic-stress-test.js` (cold-load first iteration, warm-cache after
— matches a real browser). It reads `loadtest/cookies.json`.

```bash
cd /path/to/lg_magazine/loadtest

# Cookies expire 8h after minting. Re-mint if stale (uses prod QRIUS_SESSION_SECRET).
SECRET="$(sed -n 's/^QRIUS_SESSION_SECRET=//p' ../.env | tr -d '\"'\''')"
QRIUS_SESSION_SECRET="$SECRET" node mint-cookies.mjs 1500
#    GATE: "Minted 1500 cookies -> loadtest/cookies.json"

# Run against production (BASE defaults to https://mybook.lgacademy.com).
k6 run -e VUS=1000 -e RAMP=15s -e HOLD=1m realistic-stress-test.js 2>&1 | tail -20
#    PASS: errors single-digit % or lower at 1000 VUs; p95 < ~3s; no replica restarts.
```

Compare `data_received.rate` / error rate against the expected cold-visit weight
in [`cold_load_baseline.md`](cold_load_baseline.md) and the bandwidth ceiling in
[`network_bandwidth_envelope.md`](network_bandwidth_envelope.md). For a stronger
gate, run a sustained `-e VUS=1000 -e RAMP=1m -e HOLD=10m` and require < 1%
errors, p95 < 3s, p99 < 5s, no memory growth in `docker stats`, no restarts.

### 6h. Browser smoke (manual, ~2 min)

Incognito → log in via Qrius → walk chapters 1→5: every background renders
(`.jpg`), L-OWL frames animate, train BGM (`kokoreli777`) and pen SFX play, no
console errors about missing assets.

---

## 7. Rollback

All changes are reversible; the app/DB are untouched and **sessions are stateless
HMAC cookies (`qrius_session`), so no rollback logs anyone out.** Roll back
newest-first.

```bash
# 7a. Code/assets — return to the previous branch/commit and redeploy.
git checkout main          # or the prior commit
git pull --ff-only
./scripts/deploy.sh        # rebuild + re-extract (re-extract is mandatory so the
                           # host assets match the rolled-back image's chunk hashes)

# 7b. Replicas back to 1 (if the multi-replica layer is the problem).
sudo docker compose -p "${COMPOSE_PROJECT_NAME:-potenlab}" up -d --scale lg-magazine=1

# 7c. nginx in-house CDN — remove the static location blocks and the upstream,
#     restore `location / { proxy_pass http://127.0.0.1:3002; ... }`, then:
sudo rm -f /etc/nginx/conf.d/lg-magazine-upstream.conf
sudo nginx -t && sudo systemctl reload nginx
#     Partial: comment out just ONE misbehaving `location ^~` block to let Node
#     serve that prefix while keeping the rest on nginx.

# 7d. Clear stale precompressed siblings if asset hashes changed.
sudo find /var/www/lg_magazine_public -name '*.gz' -delete
sudo find /var/www/lg_magazine_public -name '*.br' -delete
```

> If a JPEG ever feels too heavy, lower quality in `scripts/convert-avif-to-jpeg.sh`
> (`-q:v 5`/`7`) and redeploy — **never** revert to webp/avif (WAF 400).

---

## 8. Watch-outs

- **`deploy.replicas` is silently ignored outside swarm.** Confirm with
  `docker compose ps`; if you see 1 container, force `up -d --scale lg-magazine=3`.
- **`docker compose restart` does NOT reload `.env`.** After any env change use
  `docker compose up -d` (which `deploy.sh` already does).
- **Sessions expire 8h** (`SESSION_MAX_AGE_SECONDS`). Stale load-test cookies →
  every request redirects to login → useless data. Re-mint before any test (§6g).
- **deploy.sh does not `git pull`, install brotli, or write nginx config.** Those
  are operator/one-time steps (§0 prereqs, §3). Don't assume the script does them.
- **Host asset path is `/var/www/lg_magazine_public` (underscore), assets at its
  root** — not `/var/www/lg-magazine/public/...`. nginx `alias` paths must match
  §3 or every asset 404s.
- **Asset 404 after deploy = stale extraction.** New JS chunk hashes shipped but
  `extract-assets.sh` didn't run / wrote to the wrong path. Fix by re-running
  `./scripts/deploy.sh`; never remove `try_files` (that masks the bug by falling
  through to Node).
- **Package manager is npm.** `bun.lock` is git-ignored; build uses `npm ci`.
- **`.jpg` is committed; `.gz`/`.br` are not.** Don't commit the compressed
  siblings (they regenerate each deploy and would bloat the repo).
- **Auth env must be live in production:** `QRIUS_MOCK=0`, `QRIUS_STUB` unset, a
  stable 64-hex `QRIUS_SESSION_SECRET` shared by all replicas (single `.env`),
  `QRIUS_REDIRECT_URI=https://mybook.lgacademy.com/api/auth/qrius/callback`,
  `QRIUS_AUTH_URL`, and `QRIUS_USERINFO_URL` from LG CNS. A missing/wrong
  user-info URL makes the callback return 502. Do **not** use `output: 'export'`
  (it disables the proxy auth gate). Full detail: §0b and
  [`qrius_oauth_guide.md`](qrius_oauth_guide.md).
- **LLM endpoint (`/api/v3/llm`) is out of scope** for capacity here; its limit
  is the AI Studio token quota, tracked separately.
