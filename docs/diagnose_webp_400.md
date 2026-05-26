# Diagnose — `/vision_express/common/*.webp` returning HTTP 400

Post-deploy of [PR #7](https://github.com/potenlab/lg_magazine/pull/7) (asset
diet + pre-compression), every file under
`https://mybook.lgacademy.com/vision_express/common/*.webp` returns
**HTTP 400 Bad Request**, while every other path under `/vision_express/`
serves correctly. Real users would see broken chapter background images.

This runbook locates the cause in **three commands** and gives the exact fix
for each possible cause.

> **Audience:** automation / coding agent (Codex) with shell access to the
> production VM. Run §1 → §3 in order. Stop at the first step where the
> result tells you which fix applies in §4.
>
> **Companion docs:**
> [cdn_inhouse_assets.md](cdn_inhouse_assets.md) ·
> [deploy_asset_diet.md](deploy_asset_diet.md).

---

## 0. What we know already (do not retest)

| Path | Public URL response | Source of response |
|---|---|---|
| `/brand/magazine-story-logo.svg` | ✅ 200 | nginx (has `X-Asset-Source: nginx-disk`) |
| `/vision_express/kokoreli777-...mp3` | ✅ 200, 2.79 MB | nginx (asset diet shipped) |
| `/vision_express/v3/owl/l-owl-09.png` | ✅ 200, 353 KB | nginx (asset diet shipped) |
| `/vision_express/common/*.webp` (every file) | ❌ **400** | **not nginx — `Connection: Close` + `Pragma: no-cache`, no `Server:` header** |

The local re-encoded files validate as `RIFF Web/P image` — they are not
corrupted. The problem is on the server / network side, not in the binary.

---

## 1. Are the files on disk?

```bash
ls -la /var/www/lg-magazine/public/vision_express/common/ | head -10
du -sh /var/www/lg-magazine/public/vision_express/common/
```

**Expected:** ~50 `.webp` files totalling ~7 MB.

| Result | Means | Skip to |
|---|---|---|
| Directory missing entirely | `extract-assets.sh` failed to copy `common/` | §4.A |
| Directory present but empty / much smaller than 7 MB | Partial copy / permissions issue | §4.A |
| Directory present, ~7 MB, files listed | Files arrived — continue to §2 | §2 |

---

## 2. Can nginx serve them directly on the VM (bypassing any external WAF)?

```bash
# 2a. Hit nginx directly on localhost — no public network in the path.
curl -sI http://127.0.0.1/vision_express/common/Chapter_01-2.webp \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source|Server)'

# 2b. Same file, but reach nginx via the listening port for HTTPS.
curl -skI https://127.0.0.1/vision_express/common/Chapter_01-2.webp \
  -H "Host: mybook.lgacademy.com" \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source|Server)'
```

**Expected:** HTTP 200, Content-Length ~720,000, `X-Asset-Source: nginx-disk`,
`Server: nginx/1.20.1`.

| Result | Means | Skip to |
|---|---|---|
| 200 OK with `X-Asset-Source: nginx-disk` | nginx is healthy → the 400 comes from **upstream of the VM** (LG WAF / firewall / reverse proxy) | §4.C |
| 404 Not Found | nginx routed the request but the file is missing on disk | §4.A |
| 403 Forbidden | File on disk but nginx cannot read it (permissions) | §4.A |
| 400 Bad Request from nginx | nginx config issue specific to this path | §4.B |
| Connection refused / cannot reach localhost | nginx not listening as expected | escalate — separate incident |

---

## 3. What do the nginx logs say?

```bash
# Recent successful + failed serves for /vision_express/common/
sudo tail -200 /var/log/nginx/access.log | grep "/vision_express/common/" | tail -20

# Any error.log entries in the last hour
sudo tail -200 /var/log/nginx/error.log
```

**Read these for context** before applying any §4 fix. Look for:

- `open() "/var/www/lg-magazine/public/vision_express/common/..." failed` →
  files missing on disk → §4.A
- `Permission denied` → §4.A (permissions branch)
- No entries at all for `/vision_express/common/*.webp` → confirms requests are
  **never reaching nginx** → §4.C (upstream block)

---

## 4. Fixes (apply only the one matching §1–§3 results)

### 4.A — Files missing or unreadable on disk

```bash
cd /path/to/lg_magazine

# Re-run the extract — overwrites /var/www/lg-magazine atomically.
./scripts/extract-assets.sh

# Fix ownership in case rsync ran without sudo.
sudo chown -R www-data:www-data /var/www/lg-magazine

# Verify the heavy webp arrived at the expected size.
ls -la /var/www/lg-magazine/public/vision_express/common/Chapter_01-2.webp
#  GATE: ~720 KB (was 1.1 MB pre-diet).

# No nginx reload needed — paths unchanged.
```

Re-run §2 to confirm: `curl -sI http://127.0.0.1/vision_express/common/Chapter_01-2.webp`
must return `HTTP 200`.

### 4.B — nginx misconfiguration on `/vision_express/common/`

This is unlikely (other paths under `/vision_express/` work), but if §2 returns
400 from nginx itself, inspect the config:

```bash
# What location blocks claim this path?
sudo nginx -T 2>/dev/null | grep -A 10 "vision_express"

# Reload after any edit
sudo nginx -t && sudo systemctl reload nginx
```

The block should be the standard one from [cdn_inhouse_assets.md §4.2](cdn_inhouse_assets.md):

```nginx
location ^~ /vision_express/ {
    alias /var/www/lg-magazine/public/vision_express/;
    try_files $uri =404;
    ...
}
```

If the `location` block is missing or `alias` is wrong, restore from
[cdn_inhouse_assets.md §4.2](cdn_inhouse_assets.md) and reload.

### 4.C — Upstream WAF / firewall is blocking the path

If §2 returns **200 from nginx locally** but the public URL returns **400 from
a non-nginx source**, the cause is **upstream of the VM** — an LG security
appliance, reverse proxy, or WAF rule.

This is **not fixable from the VM**. It must be raised to LG IT.

**Email to send to LG 인화원 IT (Hyewon-san):**

> 안녕하세요 혜원님,
>
> `mybook.lgacademy.com`의 정적 자원 일부가 HTTP 400 에러를 반환하고 있습니다.
> VM 내부에서 nginx에 직접 요청 시에는 정상 응답하지만, 외부 공개 URL로 요청 시
> nginx가 아닌 다른 출처에서 400 응답이 돌아옵니다 (응답 헤더에 `Server: nginx`가 없고
> `Connection: Close` + `Pragma: no-cache`가 포함됨 — 일반적으로 WAF 시그니처).
>
> **영향 받는 경로:** `/vision_express/common/*.webp` (모든 챕터 배경 이미지)
> **정상 동작 경로:** `/vision_express/v3/owl/*.png`, `/vision_express/*.mp3`,
> `/brand/*.svg`
>
> 인화원 환경 내에 `/vision_express/common/` 경로를 차단하거나 검사하는 보안 장비/규칙이
> 적용되어 있는지 확인 부탁드립니다. 어제 부하 테스트 직후 발생한 것으로 보아
> rate limit / IPS rule이 자동 적용된 가능성도 있습니다.
>
> 감사합니다.

While waiting on LG IT, **do not redeploy**. The bytes are correctly on the
VM; redeploying will not unblock the WAF. Continue developing on a feature
branch.

---

## 5. Verification after fix

Regardless of which fix applied, confirm end-to-end before reporting resolved:

```bash
# Heavy webp — should now be ~720 KB (post-diet)
curl -sI https://mybook.lgacademy.com/vision_express/common/Chapter_01-2.webp \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source)'
# GATE: HTTP/2 200 · Content-Length ~720000 · X-Asset-Source: nginx-disk

# Several other webp paths
for f in letter_unfold.webp arriving-train.webp chapter05.webp morning-room.webp; do
  echo -n "  $f: "
  curl -s -o /dev/null -w "%{http_code} · %{size_download}B\n" \
    "https://mybook.lgacademy.com/vision_express/common/$f"
done
# GATE: every line shows 200 with non-zero Content-Length.
```

Once all webp paths return 200, the deployment is verified healthy. The
1,000-VU stress test can now be re-run (see
[deploy_asset_diet.md §6](deploy_asset_diet.md)).

---

## 6. Notes

- **Why this happens to webp specifically:** the public path `/vision_express/common/`
  was not load-tested during the original k6 sweep (the stress script only
  fetches `/_next/static/` JS chunks), so a WAF rule on this path could have
  existed for hours without being noticed. Real users would see broken images
  immediately on opening the magazine.
- **Why the response signature points at a WAF:** the broken response has no
  `Server:` header, includes `Connection: Close` and
  `Pragma: no-cache, must-revalidate`, and content-type `text/html` with
  zero bytes of body. nginx never produces this exact combination. Standard
  enterprise WAFs (F5 ASM, Imperva, etc.) do.
- **Rollback is not a fix.** Reverting PR #7 will not change the WAF response —
  the path is the same regardless of the bytes behind it. Only LG IT can
  unblock the path (§4.C), or restore the files on disk (§4.A).
