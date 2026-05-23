# Switch Production AI Studio API Code → `LG_BOOK_GENERIC`

Replace the shared `test_api_2` LLM endpoint with the newly-registered
**`LG_BOOK_GENERIC`** API on the production VM. One env var, one container
restart, one verification.

> **Audience:** an automation / coding agent (Codex) running on the production
> server. Every step has a verification gate — do not continue past a failed
> gate.
>
> **Companion docs:** [qrius_production_deployment.md](qrius_production_deployment.md)
> · [scaling_plan_3_replicas.md](scaling_plan_3_replicas.md).

---

## 0. TL;DR

```bash
cd /path/to/lg_magazine
cp .env .env.backup-$(date +%Y%m%d-%H%M)
sed -i 's/^AISTUDIO_API_CODE=.*/AISTUDIO_API_CODE=LG_BOOK_GENERIC/' .env
docker compose up -d
```

Then open the AI Studio dashboard and confirm one call lands on
`LG_BOOK_GENERIC` in 호출 이력. Done.

---

## 1. Why this change

The current production env has:

```
AISTUDIO_API_CODE=test_api_2
```

`test_api_2` is the AI Studio workspace's **shared "for test" endpoint**
(Gemini 3.1 Flash Lite). It has a small daily token quota that the app keeps
exhausting — every exhausted call returns HTTP 500 to the user with:

> `aistudio call: 400 {"resultVal":"err","errMsg":"하루 토큰 호출량 한도를 초과하였습니다. 익일 시도해 주시기 바랍니다."}`

The team has registered a **dedicated API** for this project on AI Studio:

| Setting | Value |
|---|---|
| **API code** | `LG_BOOK_GENERIC` |
| **API name** | `LG Magazine - Vision Express` |
| **Model** | Claude Sonnet 4 |
| **Mode** | API |
| **Prompt #1** | Pure pass-through — `{{SYSTEM}}` in system slot, `{{USER}}` in user slot |
| **Parameters** | `SYSTEM`, `USER` (case-sensitive) |
| Dashboard URL | `https://aistudio.singlex.com/SSetting/GenAIPrompt/LG_BOOK_GENERIC` |

The only thing left is to point the production app at it.

---

## 2. Pre-flight checks

Stop and report if any of these fails.

```bash
cd /path/to/lg_magazine

# Confirm the repo and env file.
test -f docker-compose.yml || { echo "wrong directory"; exit 1; }
test -f .env || { echo ".env missing — production env file must exist"; exit 1; }

# Confirm the current value is what we expect.
grep -E '^AISTUDIO_API_CODE=' .env
#   expected: AISTUDIO_API_CODE=test_api_2

# Confirm Docker is available and the app container is running.
docker compose ps
#   expected: lg-magazine service is "Up"
```

---

## 3. Apply the change

```bash
# 1. Back up .env (it holds production secrets — never edit without a backup).
cp .env .env.backup-$(date +%Y%m%d-%H%M)

# 2. Swap the value in-place.
sed -i 's/^AISTUDIO_API_CODE=.*/AISTUDIO_API_CODE=LG_BOOK_GENERIC/' .env

# 3. Verify the line changed.
grep -E '^AISTUDIO_API_CODE=' .env
#   expected: AISTUDIO_API_CODE=LG_BOOK_GENERIC
```

### Notes

- **Case matters.** Use `LG_BOOK_GENERIC` exactly (uppercase, underscores).
  This matches the dashboard URL slug. The provider builds the call URL as
  `/genai/{apiCode}/prompt/{promptIndex}` — see
  [../src/lib/llm/providers/aistudio.ts:86](../src/lib/llm/providers/aistudio.ts#L86).
- **No other env vars change.** `AISTUDIO_PROMPT_INDEX=1` stays as-is — prompt
  #1 is the one configured on the new API.
- **`.env`, not `.env.local`.** Docker Compose reads `.env`. `.env.local` is
  for local dev only.

---

## 4. Restart the container

```bash
docker compose up -d
```

**Do not use `docker compose restart`** — it does *not* reload `env_file`. Only
`up -d` re-creates the container with the new environment.

Wait ~45s for the health check, then:

```bash
docker compose ps
#   GATE: lg-magazine shows "Up ... (healthy)".

docker compose exec lg-magazine printenv AISTUDIO_API_CODE
#   GATE: prints LG_BOOK_GENERIC
```

If `printenv` still shows `test_api_2`, the container did not pick up the new
env — re-run `docker compose up -d` (and check that no override is set in
`docker-compose.yml`'s inline `environment:` block, which would shadow `.env`).

---

## 5. Verify in production

Trigger one real LLM action through the app (any task that calls
[../src/app/api/v3/llm/route.ts](../src/app/api/v3/llm/route.ts) — for example
walking the Vision Express flow far enough to trigger a reflection).

Then, on the AI Studio dashboard:

| Check | Where | Expected |
|---|---|---|
| Latest call lands on the new API | **호출 이력 (Call History)** | Top row's API code = `LG_BOOK_GENERIC`, not `test_api_2`, with a 2xx-equivalent success status. |
| Token usage accrues correctly | **비용 대시보드 (Cost Dashboard)** | Today's tokens appear under `LG_BOOK_GENERIC`. |
| Quota error is gone | trigger another LLM call | No `하루 토큰 호출량 한도` error in the response. |

If the call lands but returns empty text → the prompt template's placeholder
syntax may be wrong. Edit prompt #1 on the dashboard and try `${SYSTEM}` /
`${USER}` (or `{SYSTEM}` / `{USER}`) instead of `{{SYSTEM}}` / `{{USER}}`.

---

## 6. Rollback

The change is one line in `.env`. To revert instantly:

```bash
cd /path/to/lg_magazine

# Option A — restore the backup taken in Section 3.
cp .env.backup-<timestamp> .env

# Option B — re-swap by hand.
sed -i 's/^AISTUDIO_API_CODE=.*/AISTUDIO_API_CODE=test_api_2/' .env

docker compose up -d
```

Within ~30 s the app is back on `test_api_2`. No sessions, no DB state, no
build artefacts touched.

---

## 7. Notes / Watch-outs

- **Model change.** The new API uses Claude Sonnet 4; `test_api_2` was Gemini
  3.1 Flash Lite. Output style and per-token cost will differ — keep an eye on
  the 비용 대시보드 for the first day.
- **Quota expectations.** The new API has its own daily token quota set on the
  dashboard. If the app starts hitting it under real traffic, request a higher
  cap from LG CNS (the AI Studio admin team).
- **Error handling is still imperfect.** The route at
  [../src/app/api/v3/llm/route.ts](../src/app/api/v3/llm/route.ts) still
  returns HTTP 500 for an upstream quota error (it should return 429/503). That
  fix is action item #6 in [scaling_plan_3_replicas.md](scaling_plan_3_replicas.md);
  not part of this runbook.
- **Privacy posture.** The `Includes sensitive information` checkbox on the new
  API is currently **off** so responses are visible in 호출 이력 (useful while
  bootstrapping). Once stable in production, toggle it on for the privacy
  benefit — see the AI Studio dashboard.
