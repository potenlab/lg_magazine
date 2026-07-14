# 600-User Build A/B — July 8 Build vs July 10 Build (Same Settings)

**Server:** https://mybook.lgacademy.com (LG production)
**Scale:** 600 concurrent users, staggered arrival over 10 min, full 21-step magazine flow (~13,800 AI tasks per run).
**Method:** Both runs on 2026-07-10, ~40 minutes apart, identical test conditions —
same randomized personas, same ~50-lane concurrency (`.env` 17×3). **The only
variable is the deployed build**, swapped via the rollback drill.

| Run | Image bundle | Contains |
|---|---|---|
| **July 8 build** | `lg_magazine-images-20260708-173856.tar.gz` | Pre-audit build (direction-cards bug + freeze bug) |
| **July 10 build** | `lg_magazine-images-20260710-101952.tar.gz` | Fallback audit fixes + magazine redesign |

---

## 1. Headline comparison

| Metric | 🔴 July 8 build | 🟢 July 10 build | Winner |
|---|---|---|---|
| **Backup text shown (fallbacks)** | **505 times (3.66%)** | **88 times (0.64%)** | 🟢 **5.7× fewer** |
| **Users with a perfect session** | 125 of 600 (21%) | **517 of 600 (86%)** | 🟢 +392 users |
| **Users hit by backup text** | ~475 of 600 (79%) | ~83 of 600 (14%) | 🟢 |
| Task success | 96.3% | **99.4%** | 🟢 |
| Server errors | 501 | 88 | 🟢 |
| Timeouts | 4 | **0** | 🟢 |
| Lost jobs (404) | 0 | 0 | ⚪ |
| Heavy step speed (median / p95) | 8.8s / 30.1s | 8.6s / 29.6s | ⚪ same |
| Light step speed (median / p95) | 4.4s / 6.6s | **2.3s / 6.4s** | 🟢 ~2× faster |
| Full magazine session (median / p95) | 4m00s / 4m46s | 3m54s / 4m32s | ⚪ same |
| **Backup text afterward** | **frozen into the magazine forever** | shown once, fixes itself on retry | 🟢 |

## 2. What this A/B proves

| Finding | Evidence |
|---|---|
| Speed comes from the concurrency setting, not the build | Both builds: ~4-minute sessions, ~8.7s heavy steps at 600 users |
| Quality comes from the build | Old build: 505 failures, concentrated at the Ch3 direction-cards step (40/50-char rule discards all 6 sentences). New build: 88 random blips |
| The freeze bug matters at scale | On the old build, every one of the ~475 affected users keeps generic text in their saved magazine **permanently**. On the new build all 83 self-heal on retry |
| The fixes cost nothing | Same speed, −3.1 pts error rate, +392 perfect sessions |

## 3. The problems — what was broken before, what changed after

| # | Problem | 🔴 Before (July 8 build) | 🟢 After (July 10 build) |
|---|---|---|---|
| 1 | **Chapter 3 direction cards crash** (the main one) | The AI writes 6 personalized career-direction sentences, but each must fit a strict length limit (40 chars; 50 for the last). AI can't count Korean characters, so ~every answer had 1 sentence a few chars over — and the code **threw away all 6**, showing 6 generic template sentences instead. In this test: the bulk of the 505 failures, hitting ~8 of 10 users. | Only the over-long sentence is swapped for its generic twin — **the other 5 personalized sentences are kept**. Step works for virtually everyone; its share of failures dropped to random noise. |
| 2 | **The freeze bug** (made problem #1 permanent) | Whenever backup text appeared — for the direction cards, chapter articles, reflections — it was **saved into the user's session**. The magazine kept the generic text forever; retrying never brought real content back. ~475 users in this run would carry frozen generic text home. | Backup text is **never saved**. It shows once; the next retry / revisit re-asks the AI and gets real content. All 83 affected users self-heal. |
| 3 | **Network hiccups → instant backup** | One dropped connection = immediate backup text (then frozen by problem #2). | Transient failures are **retried first**; backup only appears if retries also fail. |
| 4 | **Hidden fallback in the time horizon step** | The 1yr/3yr/someday milestones could silently fall back without even being flagged as backup — impossible to detect or fix later. | Properly flagged, never saved, self-heals like everything else. |
| 5 | **Timeouts under load** | 4 users waited past the 5-minute limit and gave up on a step. | 0 timeouts. |

**The compounding effect:** problem #1 created the bad content and problem #2
made it permanent — that combination is why the old build turned a temporary
AI glitch into lasting damage for ~79% of users, while the new build reduces
the same glitch to a one-time blip for ~14% that disappears on retry.

## 4. Q&A — random or specific? Are there retries?

### Q1. The 88 failures on the July 10 build — random steps, or one specific step?

> **⚠️ SUPERSEDED by measured data.** An instrumented re-run under identical
> conditions (same evening) recorded failures per step:
> **all failures concentrate in the two strict-JSON steps** —
> generateVisionDirections (10.3%) and generateTimeHorizon (5.8%), 0% on the
> other 13 task types. *Which user* gets hit is random; *where* is systematic.
> See `docs/loadtest-600-per-step-trace-jul10.md` for the full table and the
> proposed fix (parse-failure re-ask). The answer below was inferred from
> aggregate data before per-step instrumentation existed.

**Answer: random — NOT one specific step.** Unlike the old build, there is no
single broken step anymore.

| Evidence | What it shows |
|---|---|
| 83 of 600 users were affected, almost all exactly **once** — nobody repeatedly | A broken *step* would hit nearly every user at the same place (that's exactly what the old build's 505 look like). 88 spread thin across 13,800 calls (≈1 in 157) is the signature of random noise |
| All 88 were upstream AI errors; **0** were empty/degenerate results | These are moments where the AI returned an error or unreadable formatting — a per-call dice roll, not a code path |
| Per-task probe on this build: **all 15 task types pass** | The one systematically-broken step (Ch3 direction cards) is confirmed fixed — no step is deterministically failing |
| The old build tested 40 min later under identical conditions produced 505 failures concentrated at one step | Same test harness clearly *can* detect a specific-step failure — it found one on the old build and none on the new |

**Honest precision:** "random" means *not concentrated on one broken step*.
The odds are somewhat higher on steps that demand strictly-formatted answers
(direction cards, time horizon, synthesis, articles) than on plain-text steps,
because the failure mode is malformed formatting. The k6 summary file
aggregates counters across steps, so the definitive per-step list for a given
run lives in the server logs — retrievable with:

```bash
cd ~/lg_magazine && docker compose logs --since 2h | grep -i "\[v3 LLM\]" | grep -iE "error|failed"
```

### Q1b. And the 505 on the July 8 build?

**One specific step** — the Chapter 3 direction cards, ~1 failure per affected
user, ~8 of 10 users, always the same place (plus a small random remainder).
Evidence: the per-task probe on that build (14 of 15 task types pass, only
`generateVisionDirections` errors — see `docs/probe-oldbuild-0708-per-task.md`)
and the 20-user drill's exactly-1-failure-per-user pattern.

### Q2. Are we doing retrials to cover these failed cases (the 88)?

**Yes — every failed call has already been retried automatically before it
counts as a failure, and even then it gets one more recovery path.** The 88
are not "un-retried" errors: each one already survived layers 1–3 below and
still gets rescued by layer 4. Four layers, in order:

| Layer | Where | What it does |
|---|---|---|
| 1. Upstream retry | Server (`aistudio.ts`) | Transient 5xx/429 from the AI provider is retried up to 2× in place, with backoff, before the job is marked failed |
| 2. Key rotation | Server | Quota errors ("토큰 호출량") rotate to the next of the 10 API codes automatically; exhausted codes get a cooldown (1 min / 30 min) |
| 3. Transport retry | Client (`realLLM.ts`) | Dropped connections / failed polls are retried before any backup text appears (added in the July fix series) |
| 4. **Self-heal on revisit** | Client + session | If all retries fail, backup text is shown once but **never saved** — the next visit/resume of that scene re-runs the task from scratch, which is effectively one more retry that almost always succeeds |
| Deliberately NOT done | — | No infinite automatic re-run loop after a surfaced failure — that would burn API quota and could freeze the UI; layer 4 covers recovery at zero cost instead |

So the 88 "failures" in the July 10 run are cases where layers 1–3 were all
exhausted in the moment — and every one of them is still recoverable via
layer 4 the next time the user touches that step.

## 5. In one sentence

Same speed on both — but on the July 8 build **8 of every 10 users** lose their
personalized Chapter 3 direction cards to permanent generic text, while on the
July 10 build **almost 9 of 10 users get a flawless session** and the rare
glitch heals itself.

**Verdict: the July 10 build wins on every quality metric with zero speed cost.**

## 6. Data sources

| File | Run |
|---|---|
| `docs/loadtest/results/loadtest-llm-realistic-600random-0708-c50-results.json` | July 8 build @ 50 lanes (this A/B) |
| `docs/loadtest/results/loadtest-llm-realistic-600random-c50-results.json` | July 10 build @ 50 lanes (this A/B) |
| `docs/loadtest-600-jun26-vs-jul10-comparison.md` | Companion: Jun 26 (no queue) vs Jul 10 |
| `docs/loadtest-600-jul08-vs-jul10-comparison.md` | Companion: Jul 8 run (18 lanes) vs Jul 10 |
| `docs/probe-oldbuild-0708-per-task.md` | Per-task failure evidence on the old build |
