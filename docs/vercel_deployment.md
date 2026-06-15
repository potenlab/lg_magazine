# Vercel Deployment Runbook (lg-magazine)

> **Audience:** Future Claude sessions / human operators picking up where the
> last deploy left off. Read this before touching `vercel deploy` so you don't
> re-discover landmines from scratch.

## TL;DR — How to deploy main to production

```bash
git fetch origin && git status            # confirm clean tree
git pull --ff-only origin main            # fast-forward only; never merge silently
vercel deploy --prod --yes \
  --token "$VERCEL_TOKEN" \
  --scope poten-labs-projects
```

- Token is **not** in this repo. Get it from the Vercel dashboard
  (https://vercel.com/account/tokens) and pass via `--token` or
  `VERCEL_TOKEN` env var. Never commit it. Rotate any token that ends up in
  chat/logs.
- Project is already linked locally via `.vercel/` (gitignored). If you're
  on a fresh checkout, link with:
  ```bash
  vercel link --yes --project lg-magazine --scope poten-labs-projects --token "$VERCEL_TOKEN"
  ```

## Project facts

| Field | Value |
|---|---|
| Vercel team / scope | `poten-labs-projects` |
| Vercel project name | `lg-magazine` (hyphen) — note the repo is `lg_magazine` (underscore) |
| Production alias | https://lg-magazine.vercel.app |
| Inspector base | https://vercel.com/poten-labs-projects/lg-magazine |
| Node version on Vercel | 24.x |
| Framework | Next.js 16.2.3 (Turbopack) |
| Build command | `npm run build` → `next build` (runs `tsc` typecheck) |
| GitHub repo | https://github.com/potenlab/lg_magazine |
| Default branch | `main` |

## Two deploy paths exist — don't confuse them

This repo has **two** deploy mechanisms; the Vercel one is what we actually
use right now.

1. **`scripts/deploy.sh` — self-hosted Linux VM** (docker compose + nginx +
   systemctl). Designed to be run *on* the production VM (see
   `docs/finish_1000_users_rollout.md`, "Audience: Codex / automation agent
   on the production VM"). **Do not try to run this from a Windows dev
   machine.** It's the deploy path for the bare-metal / Docker fallback.

2. **`vercel deploy --prod`** — Vercel-hosted production. This is what
   `https://lg-magazine.vercel.app` actually serves. Run from any machine
   that has the CLI, the token, and a linked `.vercel/` folder.

If unsure which path the user wants, **ask**. Don't run both.

## Build will type-check — landmines history

Vercel's build runs `next build`, which runs TypeScript. Type errors fail
the deploy. Past incidents to be aware of:

### 2026-06-02: `helpRequests` missing in `StrengthSynthesisScene.tsx`

- Commit `227d65b` ("ch2 magazine: pass raw helpRequests + rebalance
  quote/analysis") added `helpRequests: string` as a required field on the
  `synthesizeStrength` contract and updated three Chapter2MagazineScene
  files — but missed `src/components/v3/scenes/StrengthSynthesisScene.tsx`,
  which also calls `llm.synthesizeStrength(...)`.
- Vercel build failed with:
  > Property 'helpRequests' is missing in type ...
- The fix is one line, mirroring the pattern from
  `Chapter2MagazineScene.tsx`:
  ```diff
    strengthCommonAsk: session.strengthCommonAsk,
  + helpRequests: session.helpRequests,
    othersDescription: session.othersDescription,
  ```
- This fix was carried in the local working tree across one deploy, then
  landed upstream as part of 서지민's batch (in commit range
  `7ebe635..e359596`, around `5918174`/`b551c88`/etc.). Working tree is now
  clean again. Lesson: when adding a required field to an LLM contract,
  `grep -rn "synthesizeStrength\b"` (or the relevant method name) to find
  all call sites before pushing.

## Deploy log — 2026-06-02 / 2026-06-04 session

Deploys triggered from this Windows dev box via the Vercel token route
(self-hosted `scripts/deploy.sh` was *not* run):

| Time (KST) | HEAD at deploy | Notes |
|---|---|---|
| 2026-06-02 ~14:30 | `227d65b` + local one-line `helpRequests` fix | First successful deploy after fix. URL: `lg-magazine-axnnjq8gv-poten-labs-projects.vercel.app` |
| 2026-06-02 (later) | `7ebe635` + same local fix carried | Picked up 서지민's `ChapterIndexPanel` 기록 button. URL: `lg-magazine-1wh1k2zqg-poten-labs-projects.vercel.app` |
| 2026-06-04 ~14:00 | `e359596` (38-commit batch from 서지민, includes the helpRequests fix upstream — local diff discarded) | URL: `lg-magazine-6x0awjl8z-poten-labs-projects.vercel.app` |

All three were promoted to `https://lg-magazine.vercel.app` via the prod
alias.

## Security checklist after deploy

- [ ] If a token was pasted in chat or any unencrypted channel, revoke it
      at https://vercel.com/account/tokens and issue a new one.
- [ ] `.vercel/` stays gitignored (already is — verify if .gitignore is
      ever edited).
- [ ] Never commit `.env*` files (already gitignored).

## Useful commands

```bash
# List recent prod deploys
vercel ls lg-magazine --prod --token "$VERCEL_TOKEN" --scope poten-labs-projects

# Inspect a specific deploy
vercel inspect <deploy-url> --token "$VERCEL_TOKEN" --scope poten-labs-projects

# Roll back (promote an older deploy to prod alias)
vercel promote <older-deploy-url> --token "$VERCEL_TOKEN" --scope poten-labs-projects

# List all projects in the team (use to confirm the right project name)
vercel projects ls --token "$VERCEL_TOKEN" --scope poten-labs-projects
```

## Open questions / TODOs

- Is there CI/CD wired for auto-deploy from `main` push? Right now deploys
  are triggered manually via CLI. The "main에 푸시만 하고 끝" answer from
  one early session suggested someone believed pushing was enough — but a
  later session deployed manually. Worth confirming whether Vercel's GitHub
  integration is enabled for this project (Vercel dashboard → Settings →
  Git). If yes, the manual CLI deploys are duplicating work.
- The self-hosted `scripts/deploy.sh` path's relationship to the Vercel
  deploy is unclear. Are both prod paths live (blue/green), or is the
  self-hosted one legacy? See `docs/finish_1000_users_rollout.md` and
  `docs/scaling_plan_3_replicas.md` — they reference 3-replica nginx setup
  that wouldn't apply to Vercel.
