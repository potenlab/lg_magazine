# 600-User Load Test — July 13 Evening Build: 100% Pass (13,800/13,800)

**Server:** https://mybook.lgacademy.com (LG production)
**Run:** 2026-07-13 evening, 600 concurrent users, staggered arrival over
10 min, full 21-step magazine flow, 23 AI tasks per session — **identical
harness, parameters, and personas** as the July 10 A/B baseline (the "88
failed cases" run) and the July 13 afternoon run.
**Build under test:** parser fix (`2100fa9`) + adaptive poll backoff and
transient-reject resubmit (`faa3dea`) + all retry layers unified at 3
(`50ccc08`), deployed via images bundle `20260713-174338`.

> 🏆 **A perfect run.** All **13,800 AI tasks succeeded (100.0%)**, all
> **600 sessions completed flawlessly (600/600)**, **0 fallbacks** shown,
> **0 LLM job errors, 0 timeouts, 0 lost jobs**. The July 10 failure
> mechanism (88 failed cases) and the July 13 afternoon infra rejections
> (459) are both at zero on this build.

## 1. Headline numbers — the three builds side by side

| Metric | Jul 10 A/B ("88" run) | Jul 13 afternoon (parser fix only) | **Jul 13 evening (this run)** |
|---|---|---|---|
| Task success | 99.4% | 96.7% | **100.0% — 13,800/13,800** |
| Fallbacks (backup text shown) | 88 (0.64%) | 459 (3.33%) | **0 (0.00%)** |
| LLM job errors | 88 | 1 | **0** |
| Perfect sessions | 517/600 (86%) | 404/600 (67%) | **600/600 (100%)** |
| Timeouts / lost jobs | 0 / 0 | 1 / 0 | **0 / 0** |
| Heavy step median / p95 | 8.6s / 29.6s | 12.9s / 38.3s | 10.6s / 33.6s |
| Session duration median | 234s | 357s | 256s |
| Total HTTP requests | 61,813 | 86,674 | 79,498 |
| Enqueue p95 | 190ms | 374ms | 270ms |

## 2. Per-step results — every task type at zero

| Task (step) | Calls | Jul 13 afternoon fails | **This run** |
|---|---|---|---|
| judgeBranch | 1,200 | 139 | **0** |
| reflectShort | 1,200 | 84 | **0** |
| extractKeyword | 600 | 13 | **0** |
| reflectPoetic | 600 | 10 | **0** |
| rephraseLight | 1,800 | 28 | **0** |
| reflectValues | 600 | 5 | **0** |
| reflectStrength | 600 | 9 | **0** |
| observePattern | 600 | 12 | **0** |
| synthesizeStrength | 600 | 14 | **0** |
| synthesizeGrowthVision | 600 | 13 | **0** |
| **generateVisionDirections** (10.3% on Jul 10) | 600 | 8 | **0** |
| **generateTimeHorizon** (5.8% on Jul 10) | 600 | 12 | **0** |
| writeChapterArticle (×4) | 2,400 | 57 | **0** |
| writeCoverHeadline | 600 | 18 | **0** |
| writeEditorNote (×2) | 1,200 | 37 | **0** |
| **TOTAL** | **13,800** | **459** | **0** |

## 3. What shipped between the afternoon and this run

| Change | Commit | Effect measured here |
|---|---|---|
| Adaptive poll backoff — job-status polling slows from 1.5s to 3s/5s/8s as a job ages, cutting HTTP load exactly at peak | `faa3dea` | Total requests down 8% vs afternoon (79,498 vs 86,674) despite sessions still running longer than Jul 10; enqueue p95 down 374ms → 270ms |
| Client resubmit of transient rejects — 5xx/network errors at enqueue retried 3× with 3–5s jitter (was: instant fallback to stub) | `faa3dea` | The afternoon's 457 instant non-202 failures: 0 survive as user-visible |
| All retry layers unified at 3 — upstream overload 2→3, parse re-ask 1→3, client resubmit 3 | `50ccc08` | Parse-failure residual ≈ p⁴; 0 LLM job errors in 13,800 tasks |

Combined with the parser fix already live since the afternoon (strict parse →
loose extraction → re-ask), the full ladder is now: **3× upstream retry →
10-key rotation → 3× parse re-ask → 3× client resubmit → self-heal on
revisit** — and in this run, nothing ever needed more than the early rungs.

## 4. Honest attribution

Three factors ended the afternoon's 459 rejections, and they can't be fully
separated: (1) poll backoff reduced peak traffic ~8%; (2) client resubmit
absorbs any transient reject before it counts as a failure; (3) the provider
had partially recovered by evening (heavy median 10.6s vs the afternoon's
12.9s — though still 23% slower than Jul 10's 8.6s, meaning this build passed
100% under *worse* provider conditions than the baseline's 99.4%). The
afternoon's failure condition — peak load during a slow-provider window — was
both reduced (1) and made survivable (2).

## 5. One-sentence answer for the CTO

The same 600-user test that produced the 88 failed cases on July 10 now
passes **13,800 of 13,800 tasks with zero fallbacks and 600/600 flawless
sessions**, on a build carrying the tolerant parser, 3× retries at every
layer, and adaptive poll backoff — measured under provider latency worse
than the baseline run's.

## 6. Data sources

| File | What |
|---|---|
| `docs/loadtest/results/loadtest-llm-realistic-600-pertask-0713-retry3x-results.json` | **This run** (per-task breakdown, all zeros) |
| `loadtest/results/summary-llm-realistic-600-pertask-0713-retry3x-raw.json` | Full k6 raw summary |
| `docs/loadtest/results/loadtest-llm-realistic-600-pertask-0713-postfix-results.json` | Jul 13 afternoon run |
| `docs/loadtest/results/loadtest-llm-realistic-600random-c50-results.json` | Jul 10 A/B baseline (the "88" run) |
| `docs/loadtest/loadtest-600-per-step-before-after-jul13.md` | Afternoon before/after analysis (incl. §3b infra-rejection anatomy) |
| `scripts/loadtest-llm-realistic-async.js` | Harness (unchanged across all three runs) |

**Ops note:** build probe-verified live before the run (16/16 on the two
formerly-failing tasks). Load-test cookies re-minted the same day (8h TTL;
secret from `.env.local`).
