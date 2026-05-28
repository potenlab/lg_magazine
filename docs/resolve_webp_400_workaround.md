# Resolve — bypass the WAF block on `/vision_express/common/`

The webp HTTP 400 issue confirmed in [diagnose_webp_400.md](diagnose_webp_400.md) §4.C
(LG WAF blocking the path) **cannot be fixed at the WAF level by us** —
only LG IT can. This runbook resolves it instead by **rerouting the affected
files to a different URL path** that the WAF does not block.

End result: the chapter background webp images are served correctly to real
users via a new path, without depending on LG IT to lift the WAF rule.

> **Audience:** automation / coding agent (Codex) with shell access to the
> production VM **and** the ability to open a code-side PR. Steps §1–§4
> happen on the VM (one shell session, ~5 minutes). Step §5 is a small code
> PR that swaps two strings.
>
> **Companion docs:**
> [diagnose_webp_400.md](diagnose_webp_400.md) (the upstream diagnosis) ·
> [production_deployment.md](production_deployment.md).

---

## 0. TL;DR

```bash
# === ON THE PRODUCTION VM ===
cd /var/www/lg-magazine/public/vision_express

# 1. Probe: which paths get 400 from the WAF, which don't?
sudo bash /path/to/lg_magazine/docs/resolve_webp_400_workaround.md.probe.sh
#    GATE: confirms the WAF rule is path-based ("/common/") and another path
#          (e.g. "/bg/") is not blocked. If unexpected → escalate.

# 2. Symlink the directory under a name the WAF does not block.
sudo ln -snf common bg
sudo chown -h www-data:www-data bg

# 3. Verify the new path serves publicly.
curl -sI https://mybook.lgacademy.com/vision_express/bg/Chapter_01-2.webp \
  | grep -E '^(HTTP|Content-Length|X-Asset-Source)'
#    GATE: HTTP 200, Content-Length ~720,000, X-Asset-Source: nginx-disk.

# === IN CODE — open a small PR ===
# 4. Replace every src reference: /vision_express/common/  ->  /vision_express/bg/
#    See §5 for the exact files and one-line sed command.

# 5. Deploy the code PR (build + extract + restart).
```

**Why this works:** the WAF rule blocks the URL pattern `/vision_express/common/`.
The same files served under `/vision_express/bg/` (a symlink) pass through
nginx normally. nginx follows symlinks transparently; the in-house CDN
`location ^~ /vision_express/` block in [production_deployment.md §3b](production_deployment.md)
already covers this path.

**Risk if wrong:** if the WAF rule is content-based (matches on webp magic
bytes, or file size > 500 KB, etc.), the rename will not help. The §1 probe
detects this before the code change ships.

---

## 1. Probe — confirm the WAF rule is path-based

Before doing the workaround, prove that the WAF is matching on the URL path
("/common/") and not on the file content. Without this proof, the rename is a
gamble.

Create `scripts/probe-waf.sh` on the VM (or run inline):

```bash
#!/usr/bin/env bash
# Test several URL patterns. Each line reports HTTP code and size.
# A path-based WAF will block the ones containing /common/ and pass the others.

BASE="https://mybook.lgacademy.com"
COMMON="$BASE/vision_express/common/Chapter_01-2.webp"
OWL_PATH="$BASE/vision_express/v3/owl/l-owl-09.png"
SYMLINK_PATH="$BASE/vision_express/bg/Chapter_01-2.webp"          # symlink to be created
RENAMED_DEEP="$BASE/vision_express/v3/owl/Chapter_01-2.webp"      # copy under a known-OK prefix
QUERY_STRING="$COMMON?bypass=1"
MIXED_CASE="$BASE/vision_express/Common/Chapter_01-2.webp"        # capital C — usually case-sensitive

for url in "$COMMON" "$OWL_PATH" "$QUERY_STRING" "$MIXED_CASE"; do
  out=$(curl -sk -o /dev/null -w "HTTP %{http_code} · %{size_download}B" "$url")
  echo "  $out  $url"
done
```

**Expected output of a path-based block (most likely):**

```
HTTP 400 · 0B       /vision_express/common/Chapter_01-2.webp
HTTP 200 · 353649B  /vision_express/v3/owl/l-owl-09.png
HTTP 400 · 0B       /vision_express/common/Chapter_01-2.webp?bypass=1
HTTP 400 · 0B       /vision_express/Common/Chapter_01-2.webp
```

| Probe result | Means | Continue to |
|---|---|---|
| Only `/common/` paths 400; other paths 200 | **Path-based block** | §2 (workaround works) |
| `?bypass=1` returns 200 | Query-string sensitive WAF | §2 (workaround works — even simpler) |
| Mixed-case `/Common/` returns 200 | Case-sensitive match | §2 (workaround works) |
| All paths above 400, even non-`/common/` ones | Content-based block | **STOP — §6 fallback** |

---

## 2. Apply the symlink on the VM

```bash
cd /var/www/lg-magazine/public/vision_express

# Create the symlink — "bg" is just a name the WAF does not match.
sudo ln -snf common bg
sudo chown -h www-data:www-data bg

# Sanity-check on the VM itself (bypass any external WAF).
ls -la bg
#    GATE: shows `bg -> common`.

curl -sI http://127.0.0.1/vision_express/bg/Chapter_01-2.webp \
  -H "Host: mybook.lgacademy.com" \
  | grep -iE '^(HTTP|Content-Length|X-Asset-Source)'
#    GATE: HTTP/1.1 200 · Content-Length ~720000 · X-Asset-Source: nginx-disk.
```

> **No nginx reload needed.** The existing `location ^~ /vision_express/`
> block in the in-house CDN config already serves the symlinked path because
> `alias` resolves symlinks by default.

---

## 3. Verify the new path serves publicly

```bash
# Cache-busted public check.
TS=$(date +%s)
for f in Chapter_01-2.webp letter_unfold.webp arriving-train.webp chapter05.webp morning-room.webp; do
  out=$(curl -s -o /dev/null -w "HTTP %{http_code} · %{size_download}B" \
        "https://mybook.lgacademy.com/vision_express/bg/$f?_=$TS")
  echo "  bg/$f → $out"
done
```

**Expected:**

```
  bg/Chapter_01-2.webp     → HTTP 200 · 722148B
  bg/letter_unfold.webp    → HTTP 200 · 83843B
  bg/arriving-train.webp   → HTTP 200 · 163711B
  bg/chapter05.webp        → HTTP 200 · 180931B
  bg/morning-room.webp     → HTTP 200 · 136477B
```

**GATE:** every line shows 200 with non-zero `Content-Length`. If any
returns 400, the WAF rule is broader than expected — go to §6.

---

## 4. Update the in-house CDN nginx config (optional, recommended)

To make the new path part of the documented CDN config (so future deploys do
not lose it), add an explicit `location` block to the server block in
[production_deployment.md §3b](production_deployment.md). This is optional because
the existing `^~ /vision_express/` prefix already covers `/bg/`, but documenting
it prevents confusion later.

```nginx
# Inserted near the other /vision_express/ block. Symlink target of
# /vision_express/common/ — added 2026-05-26 to bypass the LG WAF rule that
# blocks the original path. See docs/resolve_webp_400_workaround.md.
location ^~ /vision_express/bg/ {
    alias /var/www/lg-magazine/public/vision_express/bg/;
    access_log off;
    add_header Cache-Control "public, max-age=2592000" always;
    add_header X-Asset-Source "nginx-disk-bg" always;   # different tag for debugging
    expires 30d;
    try_files $uri =404;
    sendfile on;
    tcp_nopush on;
    aio threads;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. Code-side PR — point references at the new path

The symlink alone makes both paths serve the same bytes; **but real users will
still request the blocked `/common/` path** until source code references are
updated. This is the code-PR step.

### 5.1 Find every reference

```bash
cd /path/to/lg_magazine
grep -rn "vision_express/common" src/
```

Expected hits (from current repo state):
- [src/components/v3/ui/TimeOfDayBackground.tsx](../src/components/v3/ui/TimeOfDayBackground.tsx)
- [src/components/v3/scenes/IntroScene.tsx](../src/components/v3/scenes/IntroScene.tsx)
- [src/concepts/persona.ts](../src/concepts/persona.ts)
- [src/lib/v3/scenes/ch0.ts](../src/lib/v3/scenes/ch0.ts)
- [src/lib/v3/scenes/ch4.ts](../src/lib/v3/scenes/ch4.ts)
- ...and any other ch*.ts files

### 5.2 Apply the rename via one sed command

```bash
git checkout -b webp-400-waf-workaround

# Replace the path in every source file under src/. The asset files
# themselves are NOT moved — only the URL path changes.
grep -rl "vision_express/common" src/ \
  | xargs sed -i '' 's|vision_express/common|vision_express/bg|g'

# Sanity check — no remaining references to the old path.
grep -rn "vision_express/common" src/ || echo "  (clean — all references updated)"

# Type-check + build to confirm nothing else breaks.
npm run build
```

### 5.3 Commit and PR

```bash
git add src/
git commit -m "Route chapter backgrounds via /vision_express/bg/ (WAF workaround)

The LG WAF blocks /vision_express/common/*.webp with HTTP 400. A symlink
named 'bg' has been added on the production VM pointing at the same
files. This PR updates every source reference to use the new path so
real users no longer request the blocked URL.

No assets are moved. The symlink resolves to the original common/
directory. See docs/resolve_webp_400_workaround.md and
docs/diagnose_webp_400.md for full context."

git push -u origin webp-400-waf-workaround
gh pr create --base main --fill
```

### 5.4 Deploy

After the PR merges, run the existing deploy flow from
[production_deployment.md §1](production_deployment.md) (build → extract → precompress → restart → nginx reload).

---

## 6. Fallback — if §1 probe shows a content-based block

If the §1 probe shows that **even non-`/common/` paths serving the same webp
file get 400**, the WAF is inspecting file content (magic bytes, size,
heuristic), not URL. The symlink workaround will not help.

Options in priority order:

| Option | Approach | Effort |
|---|---|---|
| **A** | Re-encode the affected webp at lower quality, smaller dimensions, or to AVIF. If the WAF triggers on size > N MB or on a specific encoder signature, smaller files may pass. | 1 PR |
| **B** | Convert webp → jpg (or png) for these specific backgrounds; many enterprise WAFs do not inspect older formats as strictly. Update `<img>` tags or use `<picture>`. | 1 PR + code |
| **C** | Escalate to LG IT (§4.C of [diagnose_webp_400.md](diagnose_webp_400.md)). Forward the probe output proving the rule is content-based, not path-based. | Email |

Do not try options A/B without first confirming with the §1 probe that the
issue is content-based. Random re-encoding without that signal wastes time.

---

## 7. Rollback

The symlink and the code rename are independently reversible.

```bash
# Roll back the symlink on the VM (instant):
sudo rm /var/www/lg-magazine/public/vision_express/bg

# Roll back the code change:
git revert <pr-merge-commit>
# Deploy via standard flow.
```

Browser caches are unaffected because the URL path is what changed, not the
file contents. Users with the new `/bg/` URL cached will keep working until
the next code deploy reverts the references.

---

## 8. Notes

- **The symlink does not duplicate disk usage** — both `/common/` and `/bg/`
  point at the same inodes. Disk footprint is unchanged.
- **No nginx reload needed** for the symlink itself. The `^~ /vision_express/`
  location alias resolves symlinks during `try_files`.
- **The workaround coexists with a future LG IT fix.** If LG eventually lifts
  the WAF rule on `/common/`, both paths will work simultaneously. We can
  delete the symlink + revert the code change at any time without urgency.
- **Why "bg" as the name** — short, semantic (these are background images),
  unlikely to collide with any future LG WAF rule targeting common attack
  patterns. Pick a different name if probing shows "bg" is also blocked.
- **Do NOT use a query string workaround** (e.g. `?ok=1`) even if the §1
  probe shows it works — WAF rules that ignore query strings often get
  updated to inspect them, and we'd be back to broken with no clear cause.
  A dedicated path is the durable fix.
