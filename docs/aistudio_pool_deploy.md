# Deploy the AI Studio API-Code Pool (Quota Failover)

Enable round-robin + quota failover across **10 AI Studio API codes** in
production, so the magazine flow survives single-code token-quota exhaustion.

> **Audience:** an automation / coding agent (Codex) running on the production
> server. Every step has a verification gate — do not continue past a failed
> gate.
>
> **Companion docs:** [aistudio_api_code_switch.md](aistudio_api_code_switch.md)
> (single-code switch this supersedes) · [production_deployment.md](production_deployment.md)
> (build pipeline, host paths, nginx).

---

## 0. TL;DR

```bash
cd /path/to/lg_magazine
git fetch origin && git checkout asset-diet-and-compression && git pull
cp .env .env.backup-$(date +%Y%m%d-%H%M)
echo 'AISTUDIO_API_CODES=LG_BOOK_GENERIC,LG_BOOK_2,LG_BOOK_3,LG_BOOK_4,LG_BOOK_5,LG_BOOK_6,LG_BOOK_7,LG_BOOK_8,LG_BOOK_9,LG_BOOK_10' >> .env
docker compose up -d --build
node scripts/test-aistudio-pool.mjs   # expect "10/10 codes healthy."
```

---

## 1. Why this change

Each AI Studio API code has its own token quota (per the dashboard sliders):

| Limit | Per code |
|---|---|
| 분당 토큰 호출량 (per-minute) | 500K |
| 일당 토큰 호출량 (per-day) | 10M |

The quota meters **input + output** tokens. One completed magazine is
input-dominated (the ~3K-token Korean `EDITOR_PERSONA` is re-sent on each of
~25–30 calls) and costs **≈ 100K tokens**. So a single code allows only
**~100 magazines/day** before returning:

> `400 {"resultVal":"err","errMsg":"하루 토큰 호출량 한도를 초과하였습니다…"}`

which the app surfaces as an HTTP 500 to the user.

**Fix:** register **10 codes** and let the app spread load across them and fail
over when one is capped.

| | Single code | 10-code pool |
|---|---|---|
| Daily capacity | 10M ≈ ~100 magazines | 100M ≈ **~1,000 magazines** |
| Per-minute aggregate | 500K | **5M** |

The 10 codes (one workspace, one JWT, only the URL path
`/genai/{code}/prompt/1` differs):

```
LG_BOOK_GENERIC, LG_BOOK_2, LG_BOOK_3, LG_BOOK_4, LG_BOOK_5,
LG_BOOK_6, LG_BOOK_7, LG_BOOK_8, LG_BOOK_9, LG_BOOK_10
```

---

## 2. How the failover works

In [../src/lib/llm/providers/aistudio.ts](../src/lib/llm/providers/aistudio.ts):

- Reads `AISTUDIO_API_CODES` (comma-separated). Falls back to the single
  `AISTUDIO_API_CODE` if unset — **`AISTUDIO_API_CODES` takes precedence.**
- **Round-robins** every call across the pool (spreads the 500K/min budget).
- On a quota rejection — detected by the `토큰 호출량` substring in the body,
  regardless of HTTP status (it arrives as both `400` and `200`+`resultVal:"err"`)
  — it **parks that code and rotates to the next**:
  - per-minute hit (`분당…`) → 60s cooldown
  - daily hit → 30min cooldown, then re-probes (self-correcting; a still-capped
    code just rotates on)
- Cooldowns + the round-robin cursor live on the cached singleton provider, so
  state persists across requests within a replica.
- Throws `all N API code(s) exhausted` only when **every** code is capped at once.

> **Multi-replica note:** each replica keeps its own cursor/cooldown. That's
> fine — they independently round-robin; the only cost is a slightly less even
> spread than a shared counter would give.

---

## 3. Prerequisites (AI Studio dashboard)

Before deploying, confirm on `https://aistudio.singlex.com` that **all 10 codes
exist** and each has:

- **Prompt #1 = pure pass-through** — `${SYSTEM}` in the system slot, `${USER}`
  in the user slot, with `SYSTEM` / `USER` parameters (case-sensitive). Same as
  `LG_BOOK_GENERIC`.
- Quota set to **10M/day + 500K/min**.

> **Consistency watch-out:** keep all 10 on the **same model**. As of writing,
> `LG_BOOK_GENERIC` is Claude Sonnet 4 while `LG_BOOK_2…10` are Sonnet 4.6.
> Because the pool round-robins, a single magazine can be written by multiple
> codes — mixing models means inconsistent prose/length within one magazine.
> Align all 10 to Sonnet 4.6.

---

## 4. Deploy

### 4.1 Pull the new code

The pool logic ships in commit `857c0c6` on `asset-diet-and-compression`.

```bash
cd /path/to/lg_magazine
git fetch origin
git checkout asset-diet-and-compression
git pull origin asset-diet-and-compression
git log -1 --oneline
#   GATE: shows 857c0c6 "Add AI Studio API-code pool with quota failover"
```

### 4.2 Add the pool env var (`.env`, **not** `.env.local`)

```bash
cp .env .env.backup-$(date +%Y%m%d-%H%M)

echo 'AISTUDIO_API_CODES=LG_BOOK_GENERIC,LG_BOOK_2,LG_BOOK_3,LG_BOOK_4,LG_BOOK_5,LG_BOOK_6,LG_BOOK_7,LG_BOOK_8,LG_BOOK_9,LG_BOOK_10' >> .env

grep -E '^AISTUDIO_API_CODES=' .env
#   GATE: prints the 10-code line
```

Leave unchanged: `LLM_PROVIDER=aistudio`, `AISTUDIO_PROMPT_INDEX=1`, and the auth
vars `AISTUDIO_WORKSPACE_ID` / `AISTUDIO_API_KEY` / `AISTUDIO_EMP_NO`.

### 4.3 Rebuild + restart

The provider source changed, so a **rebuild** is required (not just a restart).
Follow the normal build pipeline in
[production_deployment.md](production_deployment.md) (build → extract-assets →
restart), or directly:

```bash
docker compose up -d --build
```

**Use `up -d`, not `docker compose restart`** — `restart` does not reload `.env`.

```bash
docker compose ps
#   GATE: lg-magazine is "Up ... (healthy)"

docker compose exec lg-magazine printenv AISTUDIO_API_CODES
#   GATE: prints the 10-code list
```

---

## 5. Verify

### 5.1 Pool smoke test (from the server)

```bash
node scripts/test-aistudio-pool.mjs
#   GATE: "10/10 codes healthy."
```

This auths once, then sends a tiny pass-through prompt to each code and prints
per-code status, returned text, and token usage.

### 5.2 Real traffic

Trigger one real magazine action, then on the AI Studio dashboard:

| Check | Where | Expected |
|---|---|---|
| Load spreads across codes | **호출 이력 (Call History)** | Recent calls land on multiple `LG_BOOK_*`, not just one |
| No quota errors | trigger more calls | No `토큰 호출량 한도 초과` in responses |
| Usage accrues | **비용 대시보드 (Cost Dashboard)** | Today's tokens appear across the pool |

---

## 6. Rollback

```bash
cd /path/to/lg_magazine

# Restore the backup taken in 4.2 …
cp .env.backup-<timestamp> .env

# … or just remove the pool line to fall back to single-code AISTUDIO_API_CODE.
sed -i '/^AISTUDIO_API_CODES=/d' .env

docker compose up -d
```

Removing `AISTUDIO_API_CODES` reverts to the single `AISTUDIO_API_CODE`. No
sessions, DB state, or build artefacts touched. (Reverting the *code* requires
re-checking-out the prior commit + rebuild, but the env toggle alone disables
the pool.)

---

## 7. Notes / Watch-outs

- **Quota meters input + output.** Confirmed via the smoke test (`tokens`
  returns `inputTokens` + `outputTokens`). Sizing math is input-dominated.
- **Capacity ceiling.** 10 codes ≈ ~1,000 magazines/day. For more, register
  additional codes and append them to `AISTUDIO_API_CODES` — no code change
  needed.
- **Thundering herd.** A true 1,000-concurrent burst at final assembly can still
  momentarily exceed 5M/min aggregate; failover spreads and retries rather than
  hard-500-ing, but watch the per-minute dashboard during load events.
- **`route.ts` still returns 500 on full exhaustion.** When *all* codes are
  capped at once the app returns HTTP 500 (should be 429/503). Optional
  follow-up; not part of this runbook.
