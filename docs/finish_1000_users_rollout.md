# Finish the 1,000-User Rollout — Stabilization Plan

Get **https://mybook.lgacademy.com** to clean 1,000-concurrent-user capacity by
finishing the in-progress 3-replica rollout, then (if needed) adding a CDN.

> **Audience:** Codex / automation agent on the production VM. Every phase has
> a verification gate — do not continue past a failed gate.
>
> **Companion docs:** [scaling_plan_3_replicas.md](scaling_plan_3_replicas.md)
> (initial rollout) · [loadtest/final-report.pdf](../loadtest/final-report.pdf)
> (the mid-deployment snapshot this plan is based on).

---

## 0. TL;DR

The latest k6 sweep against production shows the replica rollout is **partially
working**: latency at 1,000 users dropped from 5.6 s → 1.9 s (2.9× faster — proof
the cores are doing work), but **errors went up** (12 % → 17.5 %). That pattern
— better latency, worse errors — is the textbook signature of nginx/upstream
routing not yet steady, not of CPU saturation.

Three phases to clean 1,000:

1. **Phase A:** stabilize the 3-replica rollout (diagnose & fix routing).
2. **Phase B:** re-run the load test, expect ~0 % errors past 600 users.
3. **Phase C:** add a CDN (only needed if you want headroom past ~1,000).

---

## 1. What the load test revealed

Numbers come from [../loadtest/final-report.pdf](../loadtest/final-report.pdf):

| Users | Before (single) | Now (mid-deploy) | Diagnosis |
|---|---|---|---|
| 100 | 0 %, 763 ms | **0 %, 664 ms** | ✅ healthy |
| 200 | 0 %, 1,726 ms | 0.6 %, 1,229 ms | 🟡 errors *appeared* but latency much better |
| 600 | 8 %, 5,586 ms | 9.7 %, **1,667 ms** | 🟡 latency 3.3 s faster — but errors held |
| 1,000 | 12 %, 5,640 ms | 17.5 %, **1,935 ms** | 🟡 latency 3.7 s faster — but errors worse |

**Interpretation:** the replicas exist and are answering. But something at the
*connection* layer (nginx upstream, health-checks, or a still-mis-pointed
`proxy_pass`) is dropping a slice of requests. The fix is in routing, not in
adding more cores.

---

## 2. Phase A — Stabilize the 3 Replicas

### 2.1 Diagnostic gates

Run these in order on the VM. Each prints exactly what we need to identify the
fault. **Do not change anything yet — collect the output first.**

```bash
cd /path/to/lg_magazine

# Q1 — Are 3 replicas actually running and healthy?
docker compose ps
#   expected: 3 rows for lg-magazine, STATUS "Up ... (healthy)"
#   if 1 row    → fix branch [A1: replicas not scaled]
#   if 3 rows but "(unhealthy)" / "(starting)" → fix branch [A4: health-check flaky]

# Q2 — Does every replica answer locally?
for p in 3002 3003 3004; do
  echo -n "port $p: "
  curl -s -o /dev/null -w "%{http_code} in %{time_total}s\n" \
    http://127.0.0.1:$p/api/auth/qrius/me
done
#   expected: each prints "401 in <0.5s" (401 = unauthenticated = process alive)
#   if a port refuses connection → that replica is down → fix branch [A1 / A4]
#   if a port hangs → fix branch [A4]

# Q3 — Is the nginx upstream block actually loaded?
sudo nginx -T 2>/dev/null | grep -A6 "upstream lg_magazine"
#   expected:
#     upstream lg_magazine {
#         server 127.0.0.1:3002 ...;
#         server 127.0.0.1:3003 ...;
#         server 127.0.0.1:3004 ...;
#         keepalive 64;
#     }
#   if empty → fix branch [A2: upstream block missing]
#   if shows only one server line → fix branch [A2]

# Q4 — Does the public server block actually use the upstream?
sudo grep -RhE "proxy_pass" /etc/nginx/conf.d/ /etc/nginx/nginx.conf 2>/dev/null \
  | grep -v "^\s*#"
#   expected: proxy_pass http://lg_magazine;
#   if you see  proxy_pass http://127.0.0.1:3002;  → fix branch [A3: proxy_pass not switched]

# Q5 — Any clues in the nginx error log?
sudo tail -100 /var/log/nginx/error.log
#   look for: "no live upstreams", "upstream timed out", "connect() failed",
#             "Connection reset by peer"
#   any of these → fix branch as indicated below
```

### 2.2 Fix branches

Apply the branch(es) the diagnostic pointed to. Re-run the diagnostic after
each fix to confirm.

#### **A1 — Only 1 replica is running**

The Compose file may not have been re-applied with `deploy.replicas: 3`.

```bash
# Confirm the file is the 3-replica version (see scaling_plan_3_replicas.md §4.2)
grep -E "replicas|3002-3004" docker-compose.yml
#   expected:
#     ports: ["127.0.0.1:3002-3004:3000"]
#     deploy: { replicas: 3, ... }

# Force-scale (works even on older Compose that ignores deploy.replicas)
docker compose up -d --scale lg-magazine=3

# Wait for health checks
sleep 60 && docker compose ps
#   GATE: 3 containers, all "Up (healthy)"
```

#### **A2 — Upstream block missing or incomplete**

Create the upstream file exactly as in [scaling_plan_3_replicas.md §4.3](scaling_plan_3_replicas.md):

```bash
sudo tee /etc/nginx/conf.d/lg-magazine-upstream.conf > /dev/null << 'EOF'
upstream lg_magazine {
    server 127.0.0.1:3002 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3004 max_fails=3 fail_timeout=15s;
    keepalive 64;
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```

#### **A3 — `proxy_pass` still pointing at a single port**

The public server block is bypassing the upstream. Find and fix:

```bash
# Locate the server block for the domain
sudo grep -RlE "mybook\.lgacademy\.com" /etc/nginx/

# Edit it (likely /etc/nginx/conf.d/mybook.lgacademy.com.conf or similar)
# In the `location / { ... }` block, replace:
#     proxy_pass http://127.0.0.1:3002;
# with:
#     proxy_pass http://lg_magazine;
#     proxy_http_version 1.1;
#     proxy_set_header Connection "";          # needed for upstream keepalive
# (keep the existing X-Forwarded-Proto / X-Forwarded-Host headers)

sudo nginx -t && sudo systemctl reload nginx
```

#### **A4 — Health-check flapping**

If `docker compose ps` shows replicas oscillating between healthy/unhealthy, the
HEALTHCHECK is too tight for the container's startup time. Loosen it in the
Dockerfile:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/qrius/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
```
Then rebuild and recreate:
```bash
docker compose build
docker compose up -d
sleep 90 && docker compose ps
#   GATE: 3 × healthy, stable for >60 s
```

#### **A5 — nginx connection limits low**

If the error log shows "worker_connections are not enough" or
"too many open files", apply the tuning from
[scaling_plan_3_replicas.md §4.3(c)](scaling_plan_3_replicas.md):

```nginx
# /etc/nginx/nginx.conf
worker_processes      auto;
worker_rlimit_nofile  65536;
events { worker_connections 4096; }
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Phase B — Verify with a Re-Test

Once Phase A is done and all gates pass, re-run the same sweep that produced
the current report. The scripts and 1,500 minted cookies are already in
[../loadtest/](../loadtest/).

```bash
cd /path/to/lg_magazine/loadtest

# Re-run the 8 concurrency levels (~12 min total)
for V in 100 200 400 600 800 1000 1200 1500; do
  echo "=== $V users ==="
  k6 run --quiet -e VUS=$V -e RAMP=15s -e HOLD=1m stress-test.js \
    2>&1 | grep -E "requests:|failed:|p95:"
  cp summary.json summary-step-$V.json
done

# Regenerate the PDF
node generate-final-report.mjs
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=final-report.pdf final-report.html
```

> **Note:** the cookies expire 8 h after minting. If `mint-cookies.mjs` was last
> run more than 8 h ago, re-mint first:
> ```bash
> SECRET="$(sed -n 's/^QRIUS_SESSION_SECRET=//p' ../.env | tr -d '"'"'"'')" \
>   QRIUS_SESSION_SECRET="$SECRET" node mint-cookies.mjs 1500
> ```

### Expected post-stabilization result

| Users | Errors | Verdict |
|---|---|---|
| 100 – 600 | **0 %** | ✅ healthy, every user served |
| 800 – 1,000 | ≤ 2 % | 🟡 close to the 3-replica ceiling |
| 1,200 + | ≥ 5 % | 🔴 hitting the next bottleneck (static assets) → see Phase C |

**If errors persist above 5 % at 600 users**, the upstream is still mis-routing.
Go back to Phase A and re-check Q3/Q4 — `nginx -T | grep -A6 lg_magazine` must
show 3 servers, and `proxy_pass http://lg_magazine` must be the only proxy_pass
for this domain.

---

## 4. Phase C — Add a CDN (only if you want headroom past ~1,000)

3 replicas alone reach ~900–1,000 users — at the *edge* of the target. For
solid headroom and to comfortably exceed 1,500, offload static assets to a CDN.
This removes the 9-file-per-visit fan-out from the origin entirely.

### Recommended: Cloudflare (free tier is enough)

1. Add `mybook.lgacademy.com` to a Cloudflare account; set DNS to proxied
   (orange cloud).
2. SSL: **Full (strict)** — Cloudflare to origin over HTTPS.
3. Create two **Cache Rules**:
   - `URI Path matches /_next/static/*` → **Cache eligibility: Eligible for
     cache**, **Edge TTL: 1 year** (content-hashed, safe).
   - `URI Path matches /public/*` OR `URI Path ends with one of [.js .css .png
     .jpg .webp .svg .woff2 .mp3 .ico]` → **Eligible for cache**, **Edge TTL:
     1 day**.
4. Leave everything else (SSR pages, `/api/*`) **un-cached** — those are
   per-user.
5. After propagation, hit `https://mybook.lgacademy.com/_next/static/<any>` and
   check the response headers — expect `cf-cache-status: HIT` after the second
   fetch.

### Expected result after CDN

Re-run the Phase B sweep. The headline figure should jump:

| Users | Errors | p95 |
|---|---|---|
| 1,000 | 0 % | < 1 s |
| 1,500 | < 1 % | < 2 s |
| 2,000 | ~5 % | 3 s+ |

---

## 5. Phase D — Production-Grade 1,000-User Validation

After Phase B (and optionally Phase C), do **one** longer sustained test to
prove the new capacity holds, not just spikes:

```bash
cd /path/to/lg_magazine/loadtest

k6 run -e VUS=1000 -e RAMP=1m -e HOLD=10m stress-test.js \
  2>&1 | tail -10
```

10 minutes at 1,000 sustained users. Pass criteria:

- Error rate **< 1 %**
- p95 latency **< 3 s**
- p99 latency **< 5 s**
- No memory growth in `docker stats` over the 10 minutes
- No replica restarts in `docker compose ps`

If all pass — capacity for 1,000 concurrent users is real and steady. Update
the [final-report.pdf](../loadtest/final-report.pdf) with the new baseline by
regenerating per Phase B.

---

## 6. Rollback

Every change in this plan is reversible. Roll back from most-recent to
oldest if anything destabilizes:

- **CDN (Phase C)** — set the Cloudflare proxy to grey-cloud (DNS-only). Traffic
  bypasses CDN immediately. No origin change needed.
- **Replicas (Phase A1)** — `docker compose up -d --scale lg-magazine=1`. The
  app is single-process again within ~30 s.
- **nginx (Phase A2/A3)** — `rm /etc/nginx/conf.d/lg-magazine-upstream.conf`
  and restore the original `proxy_pass http://127.0.0.1:3002`, then
  `sudo nginx -t && sudo systemctl reload nginx`.

Sessions survive all rollbacks because they are stateless HMAC cookies; no user
is logged out.

---

## 7. Watch-outs

- **Don't conflate "deploy.replicas: 3" with actually 3 containers running.**
  Always confirm with `docker compose ps`. Older Compose versions silently
  ignore `deploy.replicas` outside swarm mode.
- **`docker compose restart` does not reload `.env`** — if you change any env
  var, use `docker compose up -d`.
- **The LLM endpoint (`/api/v3/llm`) is NOT in this test scope.** Its
  bottleneck is the AI Studio daily token quota and is being tracked separately
  in [aistudio_api_code_switch.md](aistudio_api_code_switch.md). The 1,000-user
  number here is for *browse* traffic only.
- **All re-tests use the same `loadtest/stress-test.js`** so the comparison
  against [final-report.pdf](../loadtest/final-report.pdf) is apples-to-apples.
  Do not change the script between tests.
- **Cookies expire after 8 h.** If a re-test is run more than 8 h after the
  last mint, the cookies are stale and every request will redirect to login —
  zero useful data. Always re-mint if in doubt.

---

## Success criteria — what "done" looks like

✅ Phase A diagnostics: all 5 gates pass.
✅ Phase B re-test: 0 % errors at 100–600 users, ≤ 2 % at 1,000.
✅ Phase D sustained test: 10 min × 1,000 users, < 1 % errors, p95 < 3 s.
✅ Updated [final-report.pdf](../loadtest/final-report.pdf) replaces the
   current mid-deployment snapshot.
