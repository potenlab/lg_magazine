# Deploy — chapter backgrounds → JPEG (LG WAF bypass, final form)

How to roll out the JPEG migration on the production VM. This supersedes the
earlier AVIF migration after the LG WAF was found to block **both `.webp` and
`.avif`** extensions.

> **Audience:** automation / coding agent (Codex) executing on the production
> server. Every step has exact commands and a verification gate.
>
> **Companion docs:**
> [deploy_asset_diet.md](deploy_asset_diet.md) — the broader PR #7 deploy
> (audio + PNG diet + pre-compression); this JPEG change rides the same
> deploy flow.
> [diagnose_webp_400.md](diagnose_webp_400.md) — the WAF probe matrix that
> proved the rule blocks `.webp` AND `.avif` but allows `.png`/`.jpg`/`.gif`.

---

## 0. TL;DR

```bash
cd /path/to/lg_magazine

# 1. switch to the branch (or pull main once PR #7 merges)
git fetch origin
git checkout asset-diet-and-compression
git pull --ff-only

# 2. standard deploy flow (same as deploy_asset_diet.md)
docker compose build
docker compose up -d
sleep 30 && docker compose ps                  # GATE: 3 × Up (healthy)
./scripts/extract-assets.sh
./scripts/precompress-assets.sh
sudo nginx -t && sudo systemctl reload nginx

# 3. verify the chapter backgrounds now serve as .jpg
curl -sI https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.jpg \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source)'
#    GATE: HTTP/2 200 · Content-Length ~830,000 · X-Asset-Source: nginx-disk
```

**Expected outcome:** every chapter background image loads cleanly. The WAF
no longer intercepts these requests because the URLs end in `.jpg` — an
extension the WAF allows.

---

## 1. Why JPEG (not webp, not AVIF)

After PR #6 (in-house CDN) shipped, the LG production WAF started blocking
URLs by file extension. A controlled probe across paths and extensions
([diagnose_webp_400.md](diagnose_webp_400.md)) gave a clean signal:

| Extension | Result across all paths | Note |
|---|---|---|
| `.png` `.jpg` `.gif` `.bmp` `.txt` | **404** (passes WAF) | Legacy formats — allowed |
| **`.webp`** | **400** (blocked) | Likely CVE-2023-4863 reaction |
| **`.avif`** | **400** (blocked) | Likely CVE-2023-5217 reaction |

Both modern image codecs got swept into a blanket WAF rule. Only LG IT can
lift it. This commit routes around it by switching to **JPEG** — the most
compression-efficient of the WAF-allowed formats for photo content.

| | Original webp | AVIF (blocked) | **JPEG (this deploy)** |
|---:|---:|---:|---:|
| Total (33 files) | 5.5 MB | 1.9 MB | **4.4 MB** |
| Per-cold-visit | (was) | ❌ HTTP 400 | ✅ HTTP 200 |
| vs original webp | — | −66 % (theoretical) | **−20 % (actual delivery)** |

JPEG at quality 85 is visually transparent for photo content. The 4.4 MB
total is heavier than AVIF would have been but **lighter than the original
webp** and is **the smallest WAF-allowed option** for these images.

---

## 2. What this deploy changes

| Layer | Change |
|---|---|
| **`public/vision_express/common/*.avif`** | All 33 AVIF files deleted (previously deleted webp files too) |
| **`public/vision_express/common/*.jpg`** | 33 new JPEG files, same basenames, quality 85 progressive |
| **`scripts/convert-avif-to-jpeg.sh`** | New reproducible converter (`ffmpeg -q:v 3 -huffman optimal`) |
| **9 source files in `src/`** | Every `.avif` reference replaced with `.jpg` (TimeOfDayBackground.tsx, IntroScene.tsx, persona.ts, ch0–ch4.ts, closing.ts) |

**No nginx config changes.** The existing `^~ /vision_express/` location block
serves JPEG files transparently with `Content-Type: image/jpeg` automatically.

---

## 3. Pre-flight checks

Run these first. **Stop and report if any fails.**

```bash
cd /path/to/lg_magazine

# 3a. Confirm the branch contains the JPEG commit.
git log --oneline -1 | grep -qE "(AVIF|webp).*JPEG|JPEG.*WAF" && echo "JPEG commit OK" \
  || git log --oneline | head -3
#    GATE: HEAD is the "Convert AVIF -> JPEG" commit (or its docs follow-up).

# 3b. Confirm no .webp or .avif files remain.
find public/vision_express/common \( -name "*.webp" -o -name "*.avif" \) | wc -l
#    GATE: prints 0

# 3c. Confirm 33 .jpg files are present.
find public/vision_express/common -name "*.jpg" | wc -l
#    GATE: prints 33

# 3d. Confirm no source code still references .webp or .avif
grep -rln "\.\\(webp\\|avif\\)" src/ || echo "  (clean)"
#    GATE: clean (no matches under src/)
```

---

## 4. Deploy

The deploy flow is identical to [deploy_asset_diet.md §3–§5](deploy_asset_diet.md).
The new `.jpg` files travel with the standard asset-extract step.

```bash
docker compose build
#    GATE: build completes with no error.

docker compose up -d
sleep 30 && docker compose ps
#    GATE: 3 × Up (healthy)

./scripts/extract-assets.sh
#    GATE: last lines print directory sizes for public.
#          /var/www/lg-magazine/public/vision_express/common/ should now contain
#          33 .jpg files and 0 .webp/.avif files.

./scripts/precompress-assets.sh
#    OK: JPEG is already compressed; most are skipped. Expected.

sudo nginx -t && sudo systemctl reload nginx
#    GATE: syntax is ok.
```

---

## 5. Verification

```bash
# 5a. THE gate that proves the WAF bypass works.
curl -sI https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.jpg \
  | grep -iE '^(HTTP|Content-Length|Content-Type|X-Asset-Source)'
#    GATE: HTTP/2 200 · Content-Length ~830000 · Content-Type: image/jpeg ·
#          X-Asset-Source: nginx-disk
#          NOT 400.

# 5b. Several other previously-blocked images, now as .jpg.
TS=$(date +%s)
for f in letter_unfold.jpg arriving-train.jpg chapter05.jpg morning-room.jpg vision_ticket.jpg Chapter_02.jpg letter_ver2.jpg; do
  out=$(curl -s -o /dev/null -w "HTTP %{http_code} · %{size_download}B" \
        "https://mybook.lgacademy.com/vision_express/common/$f?_=$TS")
  echo "  common/$f → $out"
done
#    GATE: every line shows 200 with non-zero Content-Length.

# 5c. Sanity: old .webp and .avif URLs should now 404 (files truly deleted).
for ext in webp avif; do
  out=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.$ext?_=$TS")
  echo "  Chapter_01-2.$ext → HTTP $out  (want 404 — file gone — NOT 400 — WAF)"
done

# 5d. Browser smoke check (manual, 2 minutes).
#     - Open https://mybook.lgacademy.com in incognito
#     - Login via Qrius
#     - Walk through chapters 1 → 5, confirm every background renders
#     - DevTools → Network: every chapter image loads as image/jpeg with 200
```

**Browser checklist:**

- [ ] Chapter 1 intro renders (`Chapter_01-2.jpg`)
- [ ] Letter unfold animation plays (`letter_unfold*.jpg`, `letter_ver2*.jpg`)
- [ ] Train station scenes render (`arriving-train.jpg`, `departing-train.jpg`)
- [ ] Chapter 5 background renders (`chapter05.jpg`)
- [ ] All vision ticket scenes render (`vision_ticket*.jpg`)
- [ ] No console errors about missing assets

---

## 6. Rollback

Reverting JPEG re-introduces the WAF-blocked AVIF/webp files. Real users
will see HTTP 400 on chapter backgrounds again.

```bash
git revert <jpeg-commit>                      # find with: git log --oneline | grep -i jpeg
docker compose build && docker compose up -d
./scripts/extract-assets.sh
```

**Better rollback strategy:** if JPEG file size becomes a problem, bump
quality DOWN (try `-q:v 5` or `-q:v 7` in `scripts/convert-avif-to-jpeg.sh`)
and re-run. Don't revert to webp/AVIF — the WAF will block those again.

---

## 7. Notes

- **Why this is the final form (probably).** PNG / JPG / GIF / BMP are all
  decades old, all WAF-safe. If LG ever broadens the WAF rule to block JPEG,
  the magazine would be unusable to far more sites than just ours and they'd
  almost certainly back it out. So JPEG is the durable choice.
- **Why JPEG at q85 (not higher).** q85 is the standard quality cutoff above
  which most viewers can't distinguish from lossless. q90+ would balloon file
  sizes ~50 % for no perceptual gain. q80 starts showing compression artifacts
  on the photo content.
- **Why we don't pre-compress JPEG with gzip/brotli.** JPEG is already
  compressed; gzip/brotli adds <2 % and burns CPU. The `precompress-assets.sh`
  script skips files where compression saves less than 5 %.
- **If the WAF rule gets lifted later:** we can re-introduce webp/AVIF.
  Convert from the JPEG sources via `cwebp` / `avifenc`. The original quality
  loss from this round-trip will be minor.
- **If a NEW asset is added** as `.webp` or `.avif` in the future, it will
  hit the WAF block. Run `./scripts/convert-avif-to-jpeg.sh` (works on AVIF)
  or `./scripts/convert-webp-to-avif.sh` followed by it.
