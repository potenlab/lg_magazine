# In-House CDN — nginx Serves Static Assets, Node Never Sees Them

How to lift **https://mybook.lgacademy.com** past the 1,000-user ceiling **without
using an external CDN** (Cloudflare / CloudFront / etc.) — by serving every
static asset directly from nginx on the production VM and keeping the Next.js
processes free for application work.

> **Audience:** an automation / coding agent (Codex) executing on the production
> server. Every step has exact file contents, exact commands, and a verification
> gate. Do not skip the gates.
>
> **Companion docs:**
> [scaling_plan_3_replicas.md](scaling_plan_3_replicas.md) — execute that plan
> *first*; this plan layers on top.
> [qrius_production_deployment.md](qrius_production_deployment.md) — base
> deployment + nginx layout.
> Load-test evidence in [../loadtest/final-report.pdf](../loadtest/final-report.pdf).

---

## 0. TL;DR

1. Extract `public/` and `.next/static/` from the freshly built image to a host
   directory once per deploy (Section 4.1).
2. Add an nginx `location` block that serves those paths from disk and **never
   proxies them to Node** (Section 4.2).
3. Add an asset-extract step to the deploy script so future builds stay in sync
   (Section 4.3).
4. `nginx -t && systemctl reload nginx`.
5. Verify (Section 6). Rollback in Section 7 if anything fails.

**Expected result:** the safe concurrent-user ceiling moves from
**~900–1,000 → ~1,400–1,600** with no external dependency and no DNS change.
The LG corporate network never has to trust a foreign edge.

---

## 1. Why — what the load test actually showed

The k6 sweep ([../loadtest/final-report.pdf](../loadtest/final-report.pdf))
pinpointed the failure mode at high concurrency:

| Phase | Observation |
|---|---|
| 100 VUs | Healthy — 0% errors, p95 < 200ms |
| 300 VUs | Healthy — single ceiling of the Node process |
| 325–350 VUs | First failures appear on **static assets + auth** |
| 1,000 VUs | 15% error rate; timeouts cluster on `/_next/static/*` and asset GETs |

Every cold visit fans out to **9+ static files** (Next.js JS chunks + CSS) plus
heavy media:

| Path | Size | Type |
|---|---:|---|
| [../public/fonts/](../public/) | ~55 MB | woff2 / ttf |
| [../public/vision_express/](../public/) | ~27 MB | webp + mp3 |
| [../public/brand/](../public/) | ~32 KB | svg |
| `.next/static/**` | ~varies | content-hashed JS / CSS |

Today **the Next.js Node process serves all of this** — the same single-threaded
process that also runs SSR, middleware (`proxy.ts`), and `/api/*`. Static-byte
streaming and JavaScript work fight for the same CPU. At 1,000 users, the bytes
win and the application stalls.

**Fix:** make nginx serve the bytes; let Node run the application. This is what
a CDN does at the edge — we just do it inside the same VM, on the spare CPU core
nginx already lives on.

---

## 2. Strategy — why in-VM is the right CDN here

**Constraint:** LG corporate / production network may block or de-prioritize
external proxy CDNs (Cloudflare, CloudFront, Fastly). Routing
`mybook.lgacademy.com` through a foreign edge also raises compliance review for
an LG-branded domain.

**In-VM nginx static serving recovers ~95% of the CDN benefit** because:

- The bottleneck is **origin CPU spent on byte streaming**, not last-mile
  latency. The production VM is in-country; KR↔KR RTTs are already ~10–25ms.
- nginx serves files via `sendfile()` + `aio threads` — zero-copy, kernel-level.
  Throughput per core is **>10×** what Node achieves for the same file.
- Browser caching does the rest. With `Cache-Control: immutable, max-age=1y`
  on `_next/static/*` (content-hashed), repeat visits fetch **0 bytes** of JS/CSS.

**What in-VM nginx does NOT solve** (intentional non-goals):

- Multi-region edge presence. Out of scope; users are in-country.
- Origin DDoS shielding. Out of scope; LG perimeter handles that.
- 100% Node offload — `/_next/image` (the image optimizer) and SSR HTML still
  hit Node. That is correct: those are dynamic.

**Capacity model:**

| Setup | Static bytes off Node | Safe ceiling |
|---|---:|---:|
| Today (1 replica, Node serves everything) | 0% | ~300 |
| 3 replicas, Node serves everything ([scaling_plan_3_replicas.md](scaling_plan_3_replicas.md)) | 0% | ~900–1,000 |
| **3 replicas + this plan** | **~95%** | **~1,400–1,600** |
| + add Korean-domestic CDN later (optional, §8) | 100% | 3,000+ |

---

## 3. Pre-flight checks

Run these first. **Stop and report if any fails.**

```bash
cd /path/to/lg_magazine                  # the repo on the server

docker --version                         # expect Docker present
docker compose ps                        # expect 3 healthy lg-magazine replicas
                                         #   (if not, run scaling_plan_3_replicas.md first)
nginx -v                                 # expect nginx present
nginx -V 2>&1 | grep -o 'with-http_gzip_static_module' \
  && echo "gzip_static OK"               # optional but recommended

test -d public/vision_express \
  && test -d public/fonts \
  && test -d public/brand \
  && echo "asset dirs OK"

grep -rl "mybook.lgacademy.com" /etc/nginx/   # note the path of the server block
                                              # — Section 4.2 edits this file
```

**Why the 3-replica gate matters:** without replicas, every static request that
*does* fall back to Node still hits a single-process bottleneck — the in-VM CDN
helps but the ceiling stays near 1,000. Do the replica plan first.

---

## 4. File changes

### 4.1 Extract assets from the built image to a host directory

nginx must serve files from a path it can read. The container's filesystem is
not directly readable by the host nginx, so we **copy the static directories
out of the image** to a dedicated host path. This happens once per deploy.

Create the host directory:

```bash
sudo mkdir -p /var/www/lg-magazine/public
sudo mkdir -p /var/www/lg-magazine/_next/static
sudo chown -R www-data:www-data /var/www/lg-magazine
```

Create the asset-extract script at
`/path/to/lg_magazine/scripts/extract-assets.sh`:

```bash
#!/usr/bin/env bash
# Copy the built static assets out of the lg-magazine image to the host path
# that nginx serves. Run AFTER `docker compose build`, BEFORE any deploy that
# changes JS/CSS chunks. Idempotent.
set -euo pipefail

IMAGE="lg-magazine:latest"
DEST="/var/www/lg-magazine"

# A throwaway container — we only need its filesystem.
CID="$(docker create "$IMAGE")"
trap 'docker rm -f "$CID" >/dev/null' EXIT

# Copy to a staging dir, then atomically swap. A naked `cp -r` over a live
# directory can race with in-flight requests; rsync + mv is safe.
TMP="$(mktemp -d /var/www/lg-magazine.XXXXXX)"
docker cp "$CID:/app/public/."        "$TMP/public/"
docker cp "$CID:/app/.next/static/."  "$TMP/_next-static/"

# Hand ownership to nginx before activation.
sudo chown -R www-data:www-data "$TMP"

# Activate: replace old content in-place. nginx re-opens files on the next
# request — no reload needed because paths do not change.
sudo rsync -a --delete "$TMP/public/"       "$DEST/public/"
sudo rsync -a --delete "$TMP/_next-static/" "$DEST/_next/static/"
sudo rm -rf "$TMP"

echo "extracted assets to $DEST"
ls -la "$DEST/public/" | head -5
du -sh "$DEST/public" "$DEST/_next/static"
```

Make it executable:

```bash
chmod +x /path/to/lg_magazine/scripts/extract-assets.sh
```

> **Why atomic swap matters.** `_next/static/*` filenames contain a content
> hash, so old + new hashes can coexist briefly. Plain `cp -r` would expose
> half-copied files to in-flight requests during the swap. `rsync --delete` to
> a sibling temp dir + replace keeps reads consistent.

### 4.2 nginx — serve assets from disk, never proxy them

**Find and edit the existing server block** for `mybook.lgacademy.com`
(the path was reported by the `grep -rl` in Section 3 — typically
`/etc/nginx/sites-available/mybook.lgacademy.com` or
`/etc/nginx/conf.d/mybook.lgacademy.com.conf`).

Inside the `server { listen 443 ssl ... server_name mybook.lgacademy.com; ... }`
block, **add these `location` blocks ABOVE** the existing
`location / { proxy_pass http://lg_magazine; ... }`:

```nginx
# ---- IN-HOUSE CDN: static assets served from disk, Node never sees them ----
#
# Order matters: more-specific `location`s win over `location /` in nginx, but
# only because of the `^~` prefix priority. All asset locations use `^~` so
# they bypass any regex matches that might otherwise capture them.

# Next.js content-hashed bundles — safe to cache forever.
location ^~ /_next/static/ {
    alias /var/www/lg-magazine/_next/static/;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Asset-Source "nginx-disk" always;
    expires 1y;
    try_files $uri =404;                   # do NOT fall through to Node
    gzip_static on;                        # serve .gz sibling if present
    brotli_static on;                      # serve .br sibling if present (needs nginx-extras)
}

# Media: webp / mp3 / svg under /public/vision_express/. Filenames are stable
# but not content-hashed — use 30d cache, rename-on-change discipline.
location ^~ /vision_express/ {
    alias /var/www/lg-magazine/public/vision_express/;
    access_log off;
    add_header Cache-Control "public, max-age=2592000" always;
    add_header X-Asset-Source "nginx-disk" always;
    expires 30d;
    try_files $uri =404;
    sendfile on;
    tcp_nopush on;
    aio threads;                           # offload disk reads to thread pool
    output_buffers 2 1m;
}

# Brand SVGs — tiny, change rarely. SVG benefits from gzip/brotli.
location ^~ /brand/ {
    alias /var/www/lg-magazine/public/brand/;
    access_log off;
    add_header Cache-Control "public, max-age=604800" always;
    add_header X-Asset-Source "nginx-disk" always;
    expires 7d;
    try_files $uri =404;
    gzip_static on;                        # serve .gz sibling if present
    brotli_static on;                      # serve .br sibling if present (needs nginx-extras)
}

# Fonts — large, immutable filename. Cache aggressively + CORS for Next/font.
location ^~ /fonts/ {
    alias /var/www/lg-magazine/public/fonts/;
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

# favicon.ico lives at /public/favicon.ico (if any).
location = /favicon.ico {
    alias /var/www/lg-magazine/public/favicon.ico;
    access_log off;
    add_header Cache-Control "public, max-age=604800" always;
    try_files $uri =404;
}
# ---- END IN-HOUSE CDN ----
```

> **Do NOT add** a `location ~* \.(js|css|woff2|...)$ { ... }` regex block.
> A blanket extension match would also catch dynamic paths and `/api/*`
> responses that happen to end with an extension. The explicit prefixes above
> are safer and match what `proxy.ts` already considers public.

**Enable gzip globally** (if not already on) — open
`/etc/nginx/nginx.conf` and ensure the `http { ... }` block contains:

```nginx
gzip              on;
gzip_vary         on;
gzip_min_length   1024;
gzip_comp_level   5;
gzip_proxied      any;
gzip_types        text/plain text/css text/xml application/json
                  application/javascript application/xml+rss
                  application/atom+xml image/svg+xml font/ttf font/otf;
# Do NOT add woff2 — already compressed; double-gzip wastes CPU.
```

> **Brotli is optional and skipped here.** Stock nginx on Debian/Ubuntu does
> not ship brotli; enabling it requires `nginx-extras` or a custom build.
> gzip alone already shrinks JS/CSS by ~70% and is the safer default. See
> §8 if you decide to add brotli later.

### 4.3 Wire asset extraction into the deploy flow

So future deploys do not forget the extract step, update whatever script the
production deploy uses. If there is no script yet, create
`/path/to/lg_magazine/scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
# Production deploy: build → extract assets → rolling restart.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

echo "==> docker compose build"
docker compose build

echo "==> extract assets to /var/www/lg-magazine"
./scripts/extract-assets.sh

echo "==> pre-compress static text assets (gzip + brotli)"
./scripts/precompress-assets.sh   # creates .gz / .br siblings in /var/www/lg-magazine

echo "==> rolling restart of 3 replicas"
docker compose up -d
sleep 30
docker compose ps

echo "==> nginx reload (picks up any cache-header changes)"
nginx -t && sudo systemctl reload nginx

echo "done."
```

```bash
chmod +x /path/to/lg_magazine/scripts/deploy.sh
```

> **Why the order matters.** If you restart the replicas *before* extracting
> assets, browsers can fetch an HTML page that references a new JS chunk
> filename that nginx does not have yet → 404. Always extract first, then
> rolling-restart Node. If you rollback Node, also re-extract from the rolled
> back image — see §7.

---

## 5. Deployment steps

Run in order. **Each step has a gate — do not continue past a failed gate.**

```bash
cd /path/to/lg_magazine

# 1. Apply the file changes from Section 4.1 (extract script).
ls scripts/extract-assets.sh
#    GATE: file exists, is +x.

# 2. Build the image (no Dockerfile change needed for this plan).
docker compose build
#    GATE: build completes.

# 3. Run the extract — populates /var/www/lg-magazine.
./scripts/extract-assets.sh
#    GATE: last lines print directory size for public + _next/static (non-zero).
#          /var/www/lg-magazine/public/vision_express must contain webp files.

# 4. Apply the nginx changes from Section 4.2, then:
nginx -t
#    GATE: "syntax is ok" + "test is successful".
sudo systemctl reload nginx
#    GATE: command returns 0; `systemctl status nginx` is active.

# 5. Smoke-test that nginx — NOT Node — is serving the asset.
curl -sI https://mybook.lgacademy.com/brand/magazine-story-logo.svg \
  | grep -E '^(HTTP|Cache-Control|X-Asset-Source|Content-Type)'
#    GATE: 200 OK · Cache-Control: public, max-age=604800 · X-Asset-Source: nginx-disk

# 6. Confirm Node is NOT being hit for that asset.
docker compose logs --tail=200 lg-magazine | grep -c 'magazine-story-logo' \
  || echo "0 (good — Node never saw it)"
#    GATE: prints 0 — no log line for the asset on any replica.

# 7. Confirm dynamic paths still proxy correctly.
curl -sI https://mybook.lgacademy.com/api/auth/qrius/me \
  | head -1
#    GATE: HTTP/2 401 (un-authenticated = proxy → Node still works).

# 8. Confirm a Next.js bundle is served from disk with the immutable header.
ASSET="$(curl -s https://mybook.lgacademy.com/ | grep -oE '/_next/static/[^"]+\.js' | head -1)"
curl -sI "https://mybook.lgacademy.com${ASSET}" \
  | grep -E '^(HTTP|Cache-Control|X-Asset-Source)'
#    GATE: 200 OK · Cache-Control: public, max-age=31536000, immutable · X-Asset-Source: nginx-disk
```

If any gate fails, jump to §7 (Rollback).

---

## 6. Verification

After Section 5:

| Check | Command | Expected |
|---|---|---|
| Asset served by nginx | `curl -sI https://.../brand/magazine-story-logo.svg \| grep X-Asset-Source` | `X-Asset-Source: nginx-disk` |
| Long cache on `_next/static` | `curl -sI https://.../_next/static/<chunk>.js` | `max-age=31536000, immutable` |
| Node CPU drop | `docker stats --no-stream` during peak | Per-replica CPU% drops vs pre-change baseline |
| App still works | open the site in a clean browser | Login → magazine renders, BGM plays, scenes load |
| Capacity re-tested | re-run the k6 sweep at 1,200 VUs (see [../loadtest/final-report.pdf](../loadtest/final-report.pdf) for method) | 0% errors well past 1,000 users |

**Browser-side check (1 minute):**

1. Open the site in an incognito window, DevTools → Network.
2. Reload. Confirm `vision_express/*.webp`, `_next/static/*.js`, and
   `fonts/*.woff2` all show `(disk cache)` on the **second** reload.
3. Their `Response Headers` panel must contain `X-Asset-Source: nginx-disk`.

---

## 7. Rollback

The change is fully reversible — the app and database are untouched.

```bash
# 1. Revert the nginx server block: delete the four `location ^~` blocks
#    added in Section 4.2, leave only the original `location / { proxy_pass ... }`.
nginx -t && sudo systemctl reload nginx

# 2. (Optional) reclaim the host disk.
sudo rm -rf /var/www/lg-magazine

# 3. Remove the deploy hook if it was added.
git checkout -- scripts/deploy.sh scripts/extract-assets.sh   # or just delete
```

After rollback, every request — including all static assets — goes back to
Node. The site continues to work; capacity returns to the 3-replica ceiling.

**Partial rollback (one location at a time):** if only one asset class
misbehaves, comment out **just** that `location ^~` block and reload nginx.
Node will resume serving that prefix until the issue is fixed.

---

## 8. Optional follow-ups (only when needed)

### 8.1 Add brotli

Worth it only if mobile users on poor links are a real concern — typical
Korean broadband does not need it.

```bash
sudo apt install nginx-extras           # ships ngx_brotli
```

Then in the `http { }` block of `/etc/nginx/nginx.conf`:

```nginx
brotli              on;
brotli_comp_level   5;
brotli_static       on;
brotli_types        text/plain text/css application/json
                    application/javascript image/svg+xml font/ttf;
```

Re-extract assets if you pre-compress `.br` siblings (`brotli -k *.js`).

### 8.2 Pre-compress JS/CSS at build time

Adds `~30%` size reduction over runtime gzip and removes per-request CPU:

```bash
# inside scripts/extract-assets.sh, after the docker cp lines:
find "$TMP/_next-static" -type f \( -name '*.js' -o -name '*.css' \) -print0 \
  | xargs -0 -P 4 -I{} gzip -9 -k {}
```

With `gzip_static on;` already set in §4.2, nginx will serve the `.gz` sibling
instead of compressing per request.

### 8.3 Layer a Korean-domestic CDN later

If usage genuinely exceeds the 1,500-user range and you want edge presence in
KR ISP networks, point a domestic CDN (KT Cloud CDN, Naver Cloud CDN, LG U+
CDN — same operator as production) at this nginx as the origin. The cache
headers from §4.2 are already correct for any well-behaved CDN — no further
code change required.

This is **strictly optional**. Do not add it before measuring need.

---

## 9. Notes

- **Same files, two readers.** The container's `public/` and the host's
  `/var/www/lg-magazine/public/` are intentionally separate copies. Bind-mounting
  the container path to the host is **not** recommended — it couples nginx's
  reads to the running container's filesystem and breaks atomic rollbacks.
- **`proxy.ts` already lets these through.** The middleware matcher
  (`/((?!api/auth/qrius|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)`)
  excludes anything with a file extension, so nginx serving these before Node
  sees them is consistent with the app's own auth model. No code change.
- **Image optimizer still hits Node.** `/_next/image?url=...` is dynamic — it
  must continue to proxy through. Do **not** add a `location ^~ /_next/image/`
  block.
- **Asset 404 = stale extraction.** If a deploy ships new JS chunks but
  `extract-assets.sh` was skipped, browsers will request `/_next/static/<new-hash>.js`
  and nginx will 404 it via `try_files`. The fix is always to re-run the
  extract script — never to remove `try_files`, which would silently fall
  through to Node and mask the bug.
- **Disk usage budget.** `/var/www/lg-magazine` holds one copy of `public/`
  (~82 MB) + `_next/static/` (~tens of MB per build). Negligible on the
  production VM but worth noting.
- **No DNS change. No external dependency.** The site stays
  `mybook.lgacademy.com` resolving to the same VM. LG corporate network
  inspects the same TLS handshake it always has.
