# Deploy — Asset Diet + Pre-Compression (PR #7)

How to roll out the asset-diet + pre-compression work
(branch `asset-diet-and-compression`, [PR #7](https://github.com/potenlab/lg_magazine/pull/7))
on the existing production VM, on top of the already-deployed 3 replicas and
in-house CDN.

> **Audience:** automation / coding agent (Codex) executing on the production VM.
> Every step has exact commands and a verification gate. Do not skip the gates.
>
> **Companion docs:**
> [cdn_inhouse_assets.md](cdn_inhouse_assets.md) (in-house CDN, prerequisite) ·
> [scaling_plan_3_replicas.md](scaling_plan_3_replicas.md) (3 replicas, prerequisite) ·
> [network_bandwidth_envelope.md](network_bandwidth_envelope.md) (why this is needed).

---

## 0. TL;DR

```bash
cd /path/to/lg_magazine

# 1. install brotli CLI (one-time, ~5s)
sudo apt-get install -y brotli

# 2. switch to the new branch (or pull main after PR #7 merges)
git fetch origin
git checkout asset-diet-and-compression
git pull --ff-only

# 3. rebuild + redeploy
docker compose build
docker compose up -d
sleep 30
docker compose ps                       # GATE: 3 × Up (healthy)

# 4. re-extract assets + pre-compress
./scripts/extract-assets.sh
./scripts/precompress-assets.sh         # NEW step — creates .gz / .br siblings

# 5. (optional, recommended) reload nginx if you also enabled brotli_static
sudo nginx -t && sudo systemctl reload nginx
```

**Expected outcome:** every cold visit ships **~2–4 MB instead of ~5–10 MB**.
Same in-house CDN, same 3 replicas, same shared 500 Mbps pipe — but each user
demands roughly **half the bytes**, so the same pipe carries ~2× more users.

---

## 1. What this deploy changes

| Layer | Change | Effect |
|---|---|---|
| **`public/vision_express/*.mp3`** | Re-encoded in place at libmp3lame VBR (q:a 2/4) | 8.2 MB → 4.75 MB total (−42 %) |
| **`public/vision_express/common/*.webp`** | Re-encoded at `cwebp -q 82` | Heavy backgrounds 1.1 MB → 705 KB |
| **`public/vision_express/v3/owl/l-owl-*.png`** | Re-encoded at `pngquant --quality=80-95` | 16 frames × ~1 MB → ~300 KB each |
| **`scripts/precompress-assets.sh`** | NEW — runs after `extract-assets.sh` | Creates `.gz` (gzip -9) and `.br` (brotli -q 11) siblings for JS/CSS/SVG |
| **nginx CDN config in [cdn_inhouse_assets.md](cdn_inhouse_assets.md)** | `gzip_static on; brotli_static on;` on `/_next/static` and `/brand` | nginx serves the pre-compressed siblings with zero per-request CPU |

**Filenames are unchanged.** No source code edits. Same paths everywhere.

---

## 2. Pre-flight checks

Run these first. **Stop and report if any fails.**

```bash
cd /path/to/lg_magazine

# 2a. Prerequisites — these MUST already be in place from earlier deploys.
docker compose ps                       # expect 3 × lg-magazine Up (healthy)
test -d /var/www/lg-magazine/public && echo "in-house CDN OK"
                                        # if missing — run cdn_inhouse_assets.md first

# 2b. Required for this deploy.
git status                              # expect clean working tree
test -f scripts/extract-assets.sh && echo "extract OK"   # from cdn_inhouse_assets.md §4.1
                                        # if missing — create per cdn_inhouse_assets.md

# 2c. Compression tools.
which gzip                              # expect /usr/bin/gzip (always present)
which brotli || sudo apt-get install -y brotli
                                        # GATE: `brotli --version` works
```

> **Optional but recommended:** `nginx-extras` ships the `ngx_brotli` module so
> nginx can serve `.br` siblings as well as `.gz`. Without it, only `.gz` is
> served (still a big win; brotli adds ~10–15 % over gzip).
>
> ```bash
> sudo apt-get install -y nginx-extras
> ```

---

## 3. Switch branch + rebuild

```bash
cd /path/to/lg_magazine

# 3a. Fetch the branch (or wait for PR #7 to merge into main, then pull main).
git fetch origin
git checkout asset-diet-and-compression
git pull --ff-only
#    GATE: `git log -1 --pretty=oneline` shows "Asset diet + pre-compression"
#          on commit 9600e9d or later.

# 3b. Rebuild the image — the lighter assets bake into the new image.
docker compose build
#    GATE: build completes with no error.
#          Image size will be smaller (~15 MB less) than the previous build.

# 3c. Rolling restart of the 3 replicas.
docker compose up -d
sleep 30
docker compose ps
#    GATE: 3 × `Up (healthy)`.
#          If only 1 starts: `docker compose up -d --scale lg-magazine=3`
```

---

## 4. Re-extract + pre-compress

```bash
# 4a. Pull the (lighter) static assets from the new image to the host.
./scripts/extract-assets.sh
#    GATE: last lines print directory sizes for public + _next/static.
#          `du -sh /var/www/lg-magazine/public/vision_express` should now be
#          ~13 MB (was ~28 MB pre-diet).

# 4b. Pre-compress JS/CSS/SVG into .gz + .br siblings.
./scripts/precompress-assets.sh
#    GATE: prints "Files compressed: N" with N > 0.
#          gzip line shows ~70 % reduction, brotli line ~75 % reduction.
#          Sample sibling exists:
#            ls /var/www/lg-magazine/_next/static/*.js.gz | head -1
#            ls /var/www/lg-magazine/_next/static/*.js.br | head -1
```

---

## 5. nginx reload (only if brotli was just enabled)

If you installed `nginx-extras` for the first time in §2c, or if the in-house
CDN `location` blocks did not yet have `brotli_static on;` / `gzip_static on;`,
update the server block from [cdn_inhouse_assets.md §4.2](cdn_inhouse_assets.md)
and reload:

```bash
sudo nginx -t
#    GATE: "syntax is ok" + "test is successful".
sudo systemctl reload nginx
#    GATE: command returns 0; `systemctl status nginx` is active.
```

If nginx was already configured correctly in earlier deploys, the file copies
in §4 are picked up automatically on the next request — no reload needed.

---

## 6. Verification

After §3–§5, run these in order:

```bash
# 6a. Asset still served from nginx (not Node) — confirms in-house CDN intact.
curl -sI https://mybook.lgacademy.com/brand/magazine-story-logo.svg \
  | grep -E '^(HTTP|X-Asset-Source|Cache-Control)'
#    GATE: HTTP/2 200 · X-Asset-Source: nginx-disk · Cache-Control: ...max-age=604800

# 6b. Heavy mp3 served at the new (smaller) size.
curl -sI https://mybook.lgacademy.com/vision_express/kokoreli777-inside-old-train-169418.mp3 \
  | grep -E '^(HTTP|Content-Length|X-Asset-Source)'
#    GATE: Content-Length around 2,800,000 bytes (~2.7 MB). Pre-diet was ~3.9 MB.

# 6c. Heavy image served at the new (smaller) size.
curl -sI https://mybook.lgacademy.com/vision_express/v3/owl/l-owl-09.png \
  | grep -E '^(HTTP|Content-Length)'
#    GATE: Content-Length around 350,000 bytes (~340 KB). Pre-diet was ~1 MB.

# 6d. JS bundle served compressed (gzip at minimum, brotli if nginx-extras installed).
ASSET="$(curl -s https://mybook.lgacademy.com/ \
         -H "Cookie: qrius_session=<any-valid-test-cookie>" \
         | grep -oE '/_next/static/[^"]+\.js' | head -1)"

# gzip
curl -sI "https://mybook.lgacademy.com${ASSET}" -H "Accept-Encoding: gzip" \
  | grep -iE '^(HTTP|Content-Encoding|Content-Length)'
#    GATE: Content-Encoding: gzip · Content-Length much smaller than the raw .js file.

# brotli (only if you installed nginx-extras)
curl -sI "https://mybook.lgacademy.com${ASSET}" -H "Accept-Encoding: br" \
  | grep -iE '^(HTTP|Content-Encoding|Content-Length)'
#    GATE (if nginx-extras): Content-Encoding: br · Content-Length even smaller than gzip.
#    OK (if not):            Content-Encoding: gzip — brotli served as gzip is acceptable.

# 6e. Open the magazine in a clean incognito browser.
#     - Login via Qrius.
#     - First page: should render with audio (kokoreli train ambient) and
#       L-OWL frames looking visually identical to before.
#     - DevTools → Network: confirm the .mp3 / .webp / .png are smaller than before.
```

**Browser smoke checklist (manual, 2 minutes):**

- [ ] L-OWL animation plays smoothly (16 frames at the new ~300 KB each)
- [ ] Chapter 1 background image (`Chapter_01-2.webp`) looks unchanged
- [ ] Train ambient audio (`kokoreli777-inside-old-train.mp3`) sounds unchanged
- [ ] Writing-pen SFX (`freesound-writing-with-pen.mp3`) sounds unchanged
- [ ] Chapter navigation works end-to-end (no broken assets)

---

## 7. Rollback

The change is fully reversible — original git history retains all pre-diet
binaries.

```bash
# 7a. Revert to the previous branch / commit.
git checkout main                                  # or whatever was running before
git pull --ff-only

# 7b. Rebuild + restart with the older (heavier) assets.
docker compose build
docker compose up -d
sleep 30 && docker compose ps                      # GATE: 3 × Up (healthy)

# 7c. Re-extract the older assets to the host path.
./scripts/extract-assets.sh                        # overwrites /var/www/lg-magazine/

# 7d. (Optional) clear any stale .gz / .br siblings that were generated against
#     the new asset hashes.
sudo find /var/www/lg-magazine -name '*.gz' -delete
sudo find /var/www/lg-magazine -name '*.br' -delete
```

Browser caches are unaffected — files have the same paths, only their content
changed. Returning users with the new (cached) versions in their browser will
still get a correct render because the older versions are byte-for-byte valid
for the same file paths.

---

## 8. Expected impact

Against the previous post-CDN load-test baseline at 1,000 VUs (129 Mbps egress,
17.66 % errors, 60 s static timeouts — see
[loadtest/cdn-comparison-report.pdf](../loadtest/cdn-comparison-report.pdf)):

| Metric | Pre-diet | Projected post-diet | Mechanism |
|---|---:|---:|---|
| Bytes per cold visit | ~5–10 MB | **~2–4 MB** | Audio −42 %, images −60 %, JS −70 % via brotli |
| 1,000-VU egress (k6 worst case) | 129 Mbps | **~65–80 Mbps** | Same pipe, half the bytes per user |
| 1,000-VU error rate (k6) | 17.66 % | **single digits** | More users now fit before the ~120 Mbps pipe cap |
| Pipe share of LG's 500 Mbps DMZ | ~26 % | **~14 %** | Reduces cross-tenant risk Kim Seok 책임 raised |

To verify the projection, re-run the stepped k6 sweep after deploy
(`loadtest/stress-test.js` with `VUS=1000`) and compare
`data_received.rate` against `loadtest/summary-cdn-step-1000.json`.

---

## 9. Notes

- **No code changes shipped in this PR.** Re-encoding was done in place, so
  `import "/vision_express/Chapter_01-2.webp"` and the audio paths in
  `BGMContext.tsx` continue to work without edits.
- **The `.gz` / `.br` siblings are build artifacts**, not committed to git.
  They are regenerated on every deploy by `scripts/precompress-assets.sh`.
  This is the correct pattern — committing them would double the repo size
  and cause merge conflicts on every JS change.
- **Brotli is preferred but not required.** If `nginx-extras` is unavailable,
  the precompress script still creates `.br` files but nginx will only serve
  `.gz`. Browsers all support gzip; the savings are ~70 % vs ~75 % — close
  enough that brotli should not block the deploy.
- **The asset diet is one-shot.** Future binary updates (adding a new chapter
  audio file, swapping a background image) should be re-encoded at the same
  targets — run `./scripts/optimize-audio.sh` and `./scripts/optimize-images.sh`
  on the source files before committing.
