# Scaling Plan — Run 3 App Replicas on the Production VM

How to lift **https://mybook.lgacademy.com** from a single Node.js process to
**3 load-balanced replicas** on the existing VM — roughly **3× the capacity at
zero hardware cost**.

> **Audience:** an automation / coding agent (Codex) executing on the production
> server. Every step has exact file contents, exact commands, and a verification
> gate. Do not skip the gates.
>
> **Companion docs:** [qrius_production_deployment.md](qrius_production_deployment.md)
> · load-test evidence in [../loadtest/final-report.pdf](../loadtest/final-report.pdf).

---

## 0. TL;DR

1. Add a `HEALTHCHECK` to the [Dockerfile](../Dockerfile) (Section 4.1).
2. Replace [docker-compose.yml](../docker-compose.yml) with the 3-replica version (Section 4.2).
3. Add an nginx `upstream` block + tuning (Section 4.3).
4. `docker compose build && docker compose up -d` → 3 containers (Section 5).
5. `nginx -t && systemctl reload nginx`.
6. Verify (Section 7). Rollback in Section 8 if anything fails.

**Expected result:** the site goes from a ~300-user ceiling to ~900–1,000
concurrent users. To exceed 1,000 comfortably, also do Section 6 (CDN).

---

## 1. Why — the load-test finding

A k6 load test ([../loadtest/final-report.pdf](../loadtest/final-report.pdf))
established the current ceiling:

| Concurrent users | Result |
|---|---|
| up to ~300 | Healthy — 0% errors |
| 325–350 | Strained — first failures |
| 400+ | Overloaded — 7–15% of requests fail |

Root cause: the app runs as **one Next.js process** (`node server.js`), which is
single-threaded for JavaScript and saturates **one CPU core** at ~480 req/s.

The production VM has **4 CPU cores** (Intel Xeon Silver 4214, 15 GiB RAM). Three
of those cores sit **idle** even while the site is failing. This plan uses them.

---

## 2. Strategy — why 3 replicas is safe here

**Run 3 app containers, load-balanced round-robin by the existing host nginx.**
Leave 1 core for nginx + the OS.

This is safe because **the app is stateless** between requests:

- **Sessions** are a self-contained HMAC-signed cookie (`qrius_session`), verified
  purely by cryptography in [src/lib/qrius/session.ts](../src/lib/qrius/session.ts).
  Any replica can verify any user's cookie — **provided all replicas share the
  same `QRIUS_SESSION_SECRET`.** They do: every replica reads the same `.env`
  file. No sticky sessions required.
- **Persistent data** (v3 sessions) is written to **Supabase**, an external
  database — not to local disk or memory.
- **Static assets** are baked into the image at build time — identical in every
  replica.

Therefore round-robin balancing across 3 replicas needs **no extra coordination**.

**Capacity budget (4-core / 15 GiB VM):**

| Resource | 3 replicas | Headroom |
|---|---|---|
| CPU | 3 cores | 1 core for nginx + OS |
| RAM | 3 × 2 GiB limit = 6 GiB | 9 GiB for OS / nginx / cache |

---

## 3. Pre-flight checks

Run these first. **Stop and report if any fails.**

```bash
cd /path/to/lg_magazine            # the repo on the server
docker --version                   # expect Docker present
docker compose version             # expect Compose v2.20+ (honors deploy.replicas)
test -f .env && echo ".env OK"     # production env file MUST exist
grep -q QRIUS_SESSION_SECRET .env && echo "secret OK"
nginx -v                           # expect nginx present on the host
docker compose ps                  # note the currently running container(s)
```

Confirm the current single container is healthy before changing anything.

---

## 4. File changes

### 4.1 Dockerfile — add a health check

The image itself does **not** change for replicas — all 3 replicas run the same
image. The only addition is a `HEALTHCHECK` so Docker and nginx can tell a hung
replica from a healthy one.

Replace [../Dockerfile](../Dockerfile) with this (only the `HEALTHCHECK` line
before `CMD` is new):

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Liveness probe: /api/auth/qrius/me is un-gated and returns JSON fast (200 when
# authenticated, 401 when not). Any status < 500 means the process is serving.
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/qrius/me').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

> Node 22 has a global `fetch`, so the health check needs no extra package.

### 4.2 docker-compose.yml — 3 replicas

Replace [../docker-compose.yml](../docker-compose.yml) with:

```yaml
services:
  lg-magazine:
    build:
      context: .
    image: lg-magazine:latest
    # 3 replicas, each binding one host port in the 3002-3004 range.
    # nginx (Section 4.3) load-balances across all three.
    ports:
      - "127.0.0.1:3002-3004:3000"
    env_file:
      - path: .env
        required: false
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
    restart: unless-stopped
    deploy:
      replicas: 3
      resources:
        limits:
          memory: 2g
```

**Why it works:** with `deploy.replicas: 3` and a published **port range**,
Compose gives each replica one host port — `3002`, `3003`, `3004`. All 3 read the
same `.env`, so they share `QRIUS_SESSION_SECRET` (Section 2).

> No `container_name` is set — that is required, names must auto-generate per
> replica.

### 4.3 nginx — upstream block + tuning

**(a) Create `/etc/nginx/conf.d/lg-magazine-upstream.conf`:**

```nginx
# Load-balances the 3 app replicas. Round-robin is safe — the app is stateless.
upstream lg_magazine {
    server 127.0.0.1:3002 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=15s;
    server 127.0.0.1:3004 max_fails=3 fail_timeout=15s;
    keepalive 64;          # reuse upstream connections, no TCP handshake per request
}
```

**(b) Find and edit the existing server block** for the domain:

```bash
grep -rl "mybook.lgacademy.com" /etc/nginx/
```

In that `server { ... }` block, the `location / { ... }` must `proxy_pass` to the
**upstream**, not a single port. Ensure it reads:

```nginx
location / {
    proxy_pass http://lg_magazine;
    proxy_http_version 1.1;
    proxy_set_header Connection "";          # required for upstream keepalive
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;                 # see deploy doc §8
    proxy_set_header X-Forwarded-Host  mybook.lgacademy.com;  # see deploy doc §8
}
```

> The two `X-Forwarded-*` headers are required so the auth flow keeps working
> behind the proxy — see [qrius_production_deployment.md](qrius_production_deployment.md) §8.
> If the server block already sets them, keep them.

**(c) Tune the main `/etc/nginx/nginx.conf`** — raise the connection limits that
collapsed under load (the "connection blocked" phase hit 4.6s p95 at 1000 users):

```nginx
worker_processes      auto;
worker_rlimit_nofile  65536;

events {
    worker_connections 4096;
}
```

---

## 5. Deployment steps

Run in order. **Each step has a gate — do not continue past a failed gate.**

```bash
cd /path/to/lg_magazine

# 1. Apply the file changes from Section 4 (Dockerfile, docker-compose.yml).

# 2. Rebuild the image (now includes the HEALTHCHECK).
docker compose build
#    GATE: build completes with no error.

# 3. Start 3 replicas.
docker compose up -d
#    GATE: `docker compose ps` lists 3 lg-magazine containers.
#    If only 1 starts, the Compose version is old — force it:
#      docker compose up -d --scale lg-magazine=3

# 4. Wait ~45s for health checks, then confirm all 3 are healthy.
sleep 45 && docker compose ps
#    GATE: all 3 containers show STATUS "Up ... (healthy)".

# 5. Confirm each replica answers on its own port.
for p in 3002 3003 3004; do
  echo -n "port $p: "
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$p/api/auth/qrius/me
done
#    GATE: each prints 401 (un-authenticated = process alive and serving).

# 6. Apply the nginx changes from Section 4.3, then:
nginx -t
#    GATE: "syntax is ok" + "test is successful".
systemctl reload nginx
#    GATE: command returns 0; `systemctl status nginx` is active.
```

---

## 6. Beyond 1,000 users — add a CDN

**3 replicas alone reach ~900–1,000 concurrent users** — that is the *edge* of
the 1,000-user target, not comfortably past it. To reliably exceed 1,000, also
offload static assets to a CDN:

| Stage | Cores used | Safe concurrent users |
|---|---|---|
| 3 replicas (this plan) | 4 of 4 | ~900–1,000 |
| **+ CDN for static assets** | 4 of 4 | **~1,500+** |
| + nginx page micro-caching | 4 of 4 | scales further |

**CDN setup (Cloudflare free tier is enough):**

1. Put `mybook.lgacademy.com` behind Cloudflare (proxied DNS).
2. Create a cache rule so `/_next/static/*` and `/public/*` (any path with a
   file extension) are **cached at the edge**. `/_next/static/*` is
   content-hashed → safe to cache indefinitely.
3. Leave all other paths (SSR pages, `/api/*`) **uncached** — they are per-user.

This removes the 9-file-per-visit static fan-out from the origin — the single
heaviest load — so the 3 replicas spend their CPU on the app, not on serving files.

**To scale to several thousand users:** move to an 8-core VM (→ 7 replicas) or
run replicas across multiple VMs behind nginx, or adopt an orchestrator
(Kubernetes / ECS) with CPU-based auto-scaling. Re-run the capacity sweep after
each change.

---

## 7. Verification

After Section 5 (and optionally Section 6):

| Check | Command | Expected |
|---|---|---|
| 3 replicas healthy | `docker compose ps` | 3 × `Up (healthy)` |
| Site reachable | `curl -I https://mybook.lgacademy.com/` | `307` (redirect to login) |
| Auth still works | open the site in a clean browser | Qrius login → magazine app |
| Load is balanced | `docker compose logs --tail=20 lg-magazine` | requests landing on **all 3** containers |
| Capacity re-tested | re-run the k6 sweep (see [../loadtest/final-report.pdf](../loadtest/final-report.pdf) for method) | 0% errors well past 300 users |

A correct result: the error-free ceiling moves from ~300 to ~900–1,000 users
(or ~1,500+ with the CDN).

---

## 8. Rollback

The change is fully reversible — nothing in the app or database is modified.

```bash
# Revert nginx
rm /etc/nginx/conf.d/lg-magazine-upstream.conf
# restore the original server block (proxy_pass http://127.0.0.1:3002)
nginx -t && systemctl reload nginx

# Revert the app to a single container
git checkout -- docker-compose.yml Dockerfile   # or restore the old files
docker compose up -d
```

Because sessions are stateless cookies, scaling down does not log anyone out.

---

## 9. Notes

- **Same image, 3 copies.** Replicas are not a code change — they are 3 runs of
  one image. The app needs no modification to be replicated.
- **Shared secret is mandatory.** All replicas must read the same `.env`. A
  mismatched `QRIUS_SESSION_SECRET` between replicas would randomly invalidate
  sessions as nginx round-robins. The single `.env` file guarantees they match.
- **Memory limits protect the host.** The 2 GiB per-replica limit stops one
  replica's leak from OOM-killing the others. With `restart: unless-stopped`,
  Docker auto-restarts a replica that crashes or fails its health check.
- **No sticky sessions.** Round-robin is correct here precisely because the app
  holds no per-user server state — see Section 2.
- **Replica count = cores − 1.** 3 replicas on a 4-core VM. If nginx proves
  light, 4 replicas can be tried, but 3 is the safe default. On a larger VM,
  scale to `cores − 1` and re-test.
