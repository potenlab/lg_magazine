# Check the AI Studio Rotation Pool in Production

A **read-only diagnostic** runbook to answer one question fast:

> **Is API rotation (the multi-code AI Studio pool) actually live in production right now?**

Run this when a client reports *"the API stopped working / failed again."* The most
common cause is **not** a bug in the rotation code — it's that production's `.env`
is still on the single `AISTUDIO_API_CODE` (one code → ~100 magazines/day → quota
500s), or the pool var was added but the container was never rebuilt.

> **Audience:** anyone with shell access to the production VM. Steps 1–4 change
> nothing. Step 6 (fix) only runs if a gate fails.
>
> **Companion docs:** [aistudio_pool_deploy.md](aistudio_pool_deploy.md) (full
> deploy) · [aistudio_api_code_switch.md](aistudio_api_code_switch.md) (single-code,
> superseded) · [production_deployment.md](production_deployment.md) (build/host paths).

> **This server (LGAPOTENLAB, 203.247.146.226):** compose project `lg_magazine`,
> service `lg-magazine`, 3 replicas. Actual container names:
> `lg_magazine-lg-magazine-1`, `lg_magazine-lg-magazine-2`, `lg_magazine-lg-magazine-3`
> (plus `lg_book_mssql` for the DB). Either targeting style works:
>
> - **Compose form** (run from the repo dir): `sudo docker compose -p lg_magazine exec lg-magazine <cmd>`
> - **Direct form** (run from anywhere): `sudo docker exec lg_magazine-lg-magazine-1 <cmd>`
>
> `docker` needs `sudo` here (the `potenlab` user isn't in the `docker` group).

---

## 0. TL;DR — 30-second health check

```bash
cd /path/to/lg_magazine          # repo checkout on the production VM
PROJECT="${COMPOSE_PROJECT_NAME:-lg_magazine}"

# A) What the running container actually sees (this is the source of truth):
sudo docker compose -p "$PROJECT" exec lg-magazine printenv AISTUDIO_API_CODES
#   GATE: prints a comma-separated list of ~10 codes.
#   If it prints NOTHING → rotation is OFF in prod. Go to §6.

# B) Are all the codes healthy on LG's side?
node scripts/test-aistudio-pool.mjs
#   GATE: "10/10 codes healthy."
```

If both gates pass, rotation is live and the keys work. If A is empty or B shows
quota-capped codes, keep reading.

---

## 1. Confirm what the running container sees (the real source of truth)

The container reads env at **start time**. The `.env` file on disk can look right
while a stale container is still running the old value — so always check inside
the container first.

```bash
cd /path/to/lg_magazine
PROJECT="${COMPOSE_PROJECT_NAME:-lg_magazine}"

sudo docker compose -p "$PROJECT" exec lg-magazine printenv AISTUDIO_API_CODES
sudo docker compose -p "$PROJECT" exec lg-magazine printenv AISTUDIO_API_CODE
sudo docker compose -p "$PROJECT" exec lg-magazine printenv LLM_PROVIDER
```

Interpret:

| `AISTUDIO_API_CODES` | `LLM_PROVIDER` | Verdict |
|---|---|---|
| 10-code list | `aistudio` | ✅ **Rotation is ON.** Pool takes precedence over the single code. |
| empty / unset | `aistudio` | ❌ **Rotation is OFF** — running on single `AISTUDIO_API_CODE`. → §6 |
| 10-code list | not `aistudio` | ⚠️ Provider isn't AI Studio at all — pool is irrelevant. Confirm intended provider. |

> **Why `_CODES` wins:** the provider reads `AISTUDIO_API_CODES || AISTUDIO_API_CODE`
> ([../src/lib/llm/providers/aistudio.ts](../src/lib/llm/providers/aistudio.ts) ~L91).
> The plural pool **always overrides** the singular. Having both set is fine.

If there are 3 replicas, spot-check one is enough — they share the same `.env`.

---

## 2. Confirm the `.env` file on disk matches

Only meaningful **after** §1. If the container is empty but the file has it, the
container is stale (someone edited `.env` without `up -d`) — see §6.

```bash
grep -E '^AISTUDIO_API_CODE(S)?=' /path/to/lg_magazine/.env
#   GATE: an AISTUDIO_API_CODES= line with ~10 codes.
#   Note: it must be in `.env`, NOT `.env.local` — compose only injects `.env`.
```

```bash
# Count the codes (sanity-check it's the full pool, not a truncated copy):
grep -E '^AISTUDIO_API_CODES=' /path/to/lg_magazine/.env \
  | sed 's/^AISTUDIO_API_CODES=//' | tr ',' '\n' | grep -c .
#   GATE: 10  (or however many codes are registered)
```

---

## 3. Confirm the container is current (not stale)

```bash
PROJECT="${COMPOSE_PROJECT_NAME:-lg_magazine}"
sudo docker compose -p "$PROJECT" ps
#   GATE: lg-magazine replica(s) "Up ... (healthy)".

# When was the container created vs. when was .env last edited?
sudo docker inspect -f '{{.State.StartedAt}}' \
  "$(sudo docker compose -p "$PROJECT" ps -q lg-magazine | head -1)"
stat -c '%y  %n' /path/to/lg_magazine/.env
#   GATE: container StartedAt is NEWER than the .env mtime.
#   If .env is newer → the edit hasn't been picked up. → §6.
```

> **`docker compose restart` does NOT reload `.env`.** A restart keeps the old
> env. Only `up -d` (which recreates the container) re-reads the file.

---

## 4. Confirm the live codes are healthy on LG's side

This is the same script used in deploy verification. It auths once and pings every
code with a tiny pass-through prompt — negligible token cost.

```bash
cd /path/to/lg_magazine
node scripts/test-aistudio-pool.mjs
#   GATE: "N/N codes healthy."
```

Read the per-code output:

- `✅ OK` — code authenticates and responds.
- `⚠️ QUOTA-CAPPED` — code is over its daily/per-minute quota **right now**. A few
  capped codes is survivable (the pool rotates past them); **all** capped = outage.
- `❌ HTTP 4xx/5xx` — code misconfigured on the dashboard (missing Prompt #1, wrong
  `SYSTEM`/`USER` params, wrong model). Fix on `https://aistudio.singlex.com`.

> Reads creds + codes from `.env` / `.env.local`. To test exactly the prod pool,
> run it from the prod checkout (or copy the prod `.env`).

---

## 5. (Optional) Prove rotation *behaves* correctly

`test-aistudio-pool.mjs` proves the codes are alive; it does **not** exercise the
failover logic (nothing is over quota during a smoke test). To prove the provider
actually parks a capped code and rotates — without burning real quota — run the
failover test, which drives the **real** provider against a local mock that fakes
the `토큰 호출량` quota body:

```bash
cd /path/to/lg_magazine
node scripts/test-aistudio-failover.mjs
#   GATE: "8 passed, 0 failed" — round-robin, park-on-cap, all-capped throws, recovery.
```

**Live end-to-end test (the client's suggested method):** on the AI Studio
dashboard, set 1–2 codes to a very low daily limit, trigger real magazine traffic,
then watch **호출 이력 (Call History)** — calls should rotate off the capped code
onto healthy ones instead of returning `토큰 호출량 한도 초과`.

---

## 6. Fix — turn rotation ON / refresh a stale container

Only if a gate above failed.

```bash
cd /path/to/lg_magazine
PROJECT="${COMPOSE_PROJECT_NAME:-lg_magazine}"

# Back up first.
cp .env .env.backup-$(date +%Y%m%d-%H%M)

# Add the pool line ONLY if §2 showed it missing (edit to match registered codes):
echo 'AISTUDIO_API_CODES=LG_BOOK_GENERIC,LG_BOOK_2,LG_BOOK_3,LG_BOOK_4,LG_BOOK_5,LG_BOOK_6,LG_BOOK_7,LG_BOOK_8,LG_BOOK_9,LG_BOOK_10' >> .env

# Recreate the container so it re-reads .env (NOT `restart`).
# No source change → no rebuild needed; `up -d` alone re-injects env.
sudo docker compose -p "$PROJECT" up -d
sleep 45 && sudo docker compose -p "$PROJECT" ps     # GATE: healthy

# Re-verify §1:
sudo docker compose -p "$PROJECT" exec lg-magazine printenv AISTUDIO_API_CODES
#   GATE: now prints the 10-code list.
```

> If the **provider code itself** is also out of date (commit `857c0c6` not present
> — check `git log --oneline | grep 857c0c6`), a rebuild is required, not just
> `up -d`. Follow [aistudio_pool_deploy.md §4](aistudio_pool_deploy.md) for the
> build → extract-assets → restart pipeline.

---

## 7. Quick reference — what each signal means

| Symptom | Likely cause | Action |
|---|---|---|
| `printenv AISTUDIO_API_CODES` empty | pool never deployed to prod | §6 add line + `up -d` |
| `.env` has it, container doesn't | container stale (`restart` used) | §6 `up -d` |
| smoke test: 1–2 codes capped | normal mid-day quota churn | none — pool rotates past them |
| smoke test: **all** codes capped | true capacity exhaustion | raise dashboard quotas or add codes |
| smoke test: `❌ HTTP 400` on a code | dashboard misconfig (Prompt #1 / params / model) | fix code on aistudio.singlex.com |
| user gets HTTP 500 only at peak | all codes momentarily capped (5M/min aggregate) | known limit; add codes; see deploy §7 |

> **Capacity reminder:** each code ≈ 10M tokens/day ≈ ~100 magazines. 10 codes ≈
> ~1,000 magazines/day. Append more codes to `AISTUDIO_API_CODES` to scale — no
> code change needed.
