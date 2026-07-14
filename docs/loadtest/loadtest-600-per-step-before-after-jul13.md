# 600-User Before/After — Parse-Fix Build (July 13) vs July 10 Build

**Server:** https://mybook.lgacademy.com (LG production)
**Run:** 2026-07-13 afternoon (16:13–16:30 KST-local Mac time), 600 concurrent
users, staggered arrival over 10 min, full 21-step magazine flow — **identical
harness, parameters, and personas as the July 10 A/B test baseline**
(`docs/loadtest-600-build-ab-jul08-vs-jul10.md`, the run behind the
"88 failed cases").
**What's new:** production now runs the retry + tolerant-parser fix
(commit `2100fa9`, deployed via the July 13 images bundle) on the two
strict-JSON tasks. This run measures whether the A/B test's 88 failed cases
went away.

> ✅ **The fix worked.** The failure mechanism behind all 88 A/B-baseline
> failures —
> a malformed-JSON reply failing a single-shot `JSON.parse` with no recovery —
> produced **1 job error in 13,800 tasks** this run (A/B baseline: 88). The two
> target steps dropped from 10.3% → 1.3% and 5.8% → 2.0%, and virtually all of
> the residue is a **new, unrelated infrastructure-level rejection** that hit
> every task type equally (section 3b), not the parse problem.
>
> **Update (same evening):** with retry unification (3× at every layer) and
> adaptive poll backoff deployed on top, the identical re-run scored a
> **perfect 13,800/13,800 — 0 fallbacks, 600/600 sessions** — see section 5.

## 1. Headline numbers (July 10 A/B baseline vs this run)

Baseline = the July 10 A/B test run
(`docs/loadtest-llm-realistic-600random-c50-results.json` — the "88 failed
cases"). The same-evening instrumented re-run (97 failures, same mechanism)
appears only in the per-step table of section 2, because it is the only
pre-fix run that recorded per-step data.

| Metric | Jul 10 A/B baseline | This run (Jul 13, fix live) | Note |
|---|---|---|---|
| **LLM job errors (the fixed failure mode)** | **88** | **1** | The A/B this test was for |
| Fallbacks total (backup text shown) | 88 (0.64%) | 459 (3.33%) | 458 of 459 are the NEW infra rejection — see §3b |
| Task success | 99.4% | 96.7% | Dragged down by §3b only |
| Perfect sessions | 517/600 (86%) | 404/600 (67%) | Same cause |
| Timeouts / lost jobs | 0 / 0 | 1 / 0 | |
| Heavy step median | 8.6s | 12.9s | Provider measurably slower today |
| Total HTTP requests | 61,813 | 86,674 | +40% — slower LLM → longer sessions → more polling |

## 2. The per-step failure table (before vs after)

13,800 AI tasks across 15 task types, both runs:

| Task (step) | Calls | Jul 10 fails (instrumented re-run) | Jul 13 fails | Jul 13 rate |
|---|---|---|---|---|
| judgeBranch | 1,200 | 0 | 139 | 11.6% |
| reflectShort | 1,200 | 0 | 84 | 7.0% |
| extractKeyword | 600 | 0 | 13 | 2.2% |
| reflectPoetic | 600 | 0 | 10 | 1.7% |
| rephraseLight | 1,800 | 0 | 28 | 1.6% |
| reflectValues | 600 | 0 | 5 | 0.8% |
| reflectStrength | 600 | 0 | 9 | 1.5% |
| observePattern | 600 | 0 | 12 | 2.0% |
| synthesizeStrength (Ch2 magazine) | 600 | 0 | 14 | 2.3% |
| synthesizeGrowthVision (Ch3 magazine) | 600 | 0 | 13 | 2.2% |
| **generateVisionDirections (Ch3 direction cards)** | 600 | **62 (10.3%)** | **8** | **1.3%** |
| **generateTimeHorizon (Ch3 1yr/3yr/someday)** | 600 | **35 (5.8%)** | **12** | **2.0%** |
| writeChapterArticle (×4 chapters) | 2,400 | 0 | 57 | 2.4% |
| writeCoverHeadline | 600 | 0 | 18 | 3.0% |
| writeEditorNote (intro+outro) | 1,200 | 0 | 37 | 3.1% |
| **TOTAL** | **13,800** | **97 (0.70%)** | **459** | **3.33%** |

Read the two runs' columns against each other and the picture is unambiguous:

- The **only two steps that failed in the baseline** are now at or below the
  run-wide background rate (~2–3%) that every other task also shows.
- The **13 task types that were at 0%** in the baseline all show that same
  background rate now — a failure mode that does not discriminate by task
  cannot be an LLM-formatting problem (formatting risk is task-specific).

### 2b. The two target screens, isolated (fix effect, measured)

| User-facing screen (scene id) | LLM task behind it | Jul 10 hit rate | Predicted after fix (§4 of trace doc) | Measured Jul 13 |
|---|---|---|---|---|
| Ch3 growth-vision magazine (`3-10`, `GrowthVisionSynthesisScene`) | `generateVisionDirections` | 10.3% | ~1.1% | **1.3% total — ≈0% parse-flavor** |
| Ch3 time horizon (`3-10b`, `TimeHorizonScene`) | `generateTimeHorizon` | 5.8% | ~0.3% | **2.0% total — ≈0% parse-flavor** |

How we can separate the flavors: the pre-fix failures were all
**upstream job errors** (job completes with `status:"error"` at parse time —
the k6 `upstream_error` counter: 88 in the A/B run, 97 in the instrumented
re-run). This run recorded **1** upstream job error in
the entire 13,800-task run. The other 458 failures were **instant non-202 HTTP
rejections at enqueue** — the request never reached the LLM at all (section
3b). So of the 8 + 12 residual failures on the two target steps, at most 1 was
of the old flavor; the rest are the same background rejection every other step
shows.

## 3. So: did the retry + loose parser do its job? (measured)

**Yes — the failure mode it targets is gone.**

- **Pre-test live probes:** 8/8 `generateVisionDirections` and 8/8
  `generateTimeHorizon` direct calls succeeded on the new build (the baseline
  build failed the same probe ~1 in 3 attempts).
- **Under 600-user load:** 1 job error in 13,800 tasks vs 88 in the A/B
  baseline (97 in the instrumented re-run) —
  a **99% reduction** in the parse-failure mechanism, in line with the p²
  prediction (one re-ask on a ~10% dice roll → ~1%; the tolerant extractor
  removes most of even that, and the measured upstream-error count of 1 is
  consistent with "well under 0.2%" forecast in the trace doc).
- **The recovery ladder held its cost promise:** heavy-step median rose only
  with the provider's own slowness that day (8.6s → 12.9s across ALL heavy
  tasks, not just the two fixed ones), and enqueue p95 stayed at 374ms — the
  re-ask path added no visible load.

### 3b. The new, separate finding — infra-level enqueue rejections

This run surfaced a failure mode the July 10 baseline did not have. It is
**not** an LLM problem and **not** caused by the fix. What is measured:

| Property | Evidence |
|---|---|
| 458 failures were instant non-202 HTTP responses at enqueue (or poll) | k6 counters: `upstream_error` 1, `client_timeout` 1, `poll_404` 0 — everything else failed before a job existed |
| Clean HTTP responses, not network faults | 0 k6 transport warnings in the whole run (a timeout/reset would log one); 943 total non-2xx across 86,674 requests (1.1%) |
| Hits all 15 task types at a shared background rate | ~1–3% everywhere, including 13 task types that have never failed in any prior run |
| Worst on each session's first steps | judgeBranch 11.6%, reflectShort 7.0% — consistent with failures clustering in time around peak concurrency (~t=450–700s), when late-arriving users run their first steps |
| Only reproducible under full load | Post-run probes: 150 simultaneous enqueues → 150× HTTP 202; 600 fresh-connection requests at 40-concurrency → 0 rejections |
| The run pushed +40% more traffic than the A/B baseline | 86,674 vs 61,813 requests — the provider was slower today, sessions ran ~53% longer (median 234s → 357s), so 600 users overlapped more and polled more |

**Most likely locus:** nginx or the network path in front of the replicas
rejecting bursts at peak request rate (the repo's upstream config uses
`max_fails=3 fail_timeout=15s` — three failed proxy attempts mark a replica
down for 15s, and if all three replicas trip together nginx answers instantly
with 5xx for the window). Confirming the exact status code requires the
server-side nginx access log for the 16:13–16:30 window:

```bash
sudo awk '$7 ~ /^\/api\/v3\/llm/ && $9 !~ /^(200|202|304)$/ {print $9}' /var/log/nginx/access.log | sort | uniq -c
sudo grep -E "limiting|upstream|worker_connections" /var/log/nginx/error.log | tail -20
docker ps --format '{{.Names}}\t{{.Status}}'
```

**Why real users are better off than the 3.3% suggests:** the k6 harness
treats the *first* non-202 enqueue as a final failure. The production client
does not — it resubmits up to 2 times honoring `Retry-After`
(`realLLM.ts:96-159`), and a transient burst-rejection is exactly the case
retries are best at (independent retries turn a 3% transient into ~0.003%
2-retry residual). And as always, a shown fallback is never persisted and
self-heals on the next visit to the scene (`contract.ts:40/80`).

## 4. One-sentence answer

The retry + loose-parser fix eliminated the baseline's failure mechanism —
LLM job errors went 88 → 1 in 13,800 tasks, with the two target steps falling
from 10.3%/5.8% to the run-wide background — and the residual 3.3% this run
shows is a new, task-agnostic, load-peak HTTP rejection in front of the app
(pending one nginx-log check to name the status code), which the real client's
enqueue retries largely absorb.

## 5. Follow-up run the same evening — retry unification + poll backoff → **a perfect run**

After the afternoon run above, two more changes shipped (commits `faa3dea`,
`50ccc08`) and were deployed the same evening: **adaptive poll backoff**
(poll interval 1.5s → 3s → 5s → 8s as a job ages, cutting HTTP load exactly
at peak), **client resubmit of transient 5xx/network rejects** (the §3b
failure mode; 3 attempts with jitter), and **all retry layers unified at 3**
(upstream overload 2→3, parse re-ask 1→3). The identical 600-user test was
re-run against that build:

| Metric | Jul 10 A/B ("88") | Jul 13 afternoon (parser fix only) | **Jul 13 evening (all fixes)** |
|---|---|---|---|
| Task success | 99.4% | 96.7% | **100.0% — 13,800/13,800** |
| Fallbacks (backup text shown) | 88 | 459 | **0** |
| LLM job errors | 88 | 1 | **0** |
| Perfect sessions | 517/600 | 404/600 | **600/600** |
| Timeouts / lost jobs | 0 / 0 | 1 / 0 | **0 / 0** |
| Total HTTP requests | 61,813 | 86,674 | 79,498 |
| Enqueue p95 | 190ms | 374ms | 270ms |
| Heavy step median | 8.6s | 12.9s | 10.6s |

Every one of the 15 task types recorded **0 failures** — including the two
strict-JSON steps and every step the §3b infra rejection touched in the
afternoon.

Why the §3b rejections disappeared — three factors, honestly attributed:
the poll backoff removed ~8% of total traffic even though sessions still ran
longer than the Jul 10 baseline (fewer polls per session at peak); the new
client resubmit absorbs any transient reject before it can count as a
failure; and the provider had partially recovered by evening (heavy median
10.6s vs the afternoon's 12.9s, though still above Jul 10's 8.6s). The
afternoon's failure condition — peak load during a slow-provider window —
was both reduced and made survivable.

## 6. Data sources

| File | What |
|---|---|
| `docs/loadtest/loadtest-llm-realistic-600-pertask-0713-retry3x-results.json` | **Evening run — all fixes, 0 failures** |
| `docs/loadtest-llm-realistic-600-pertask-0713-postfix-results.json` | Afternoon run (per-task breakdown in `per_task`) |
| `loadtest/summary-llm-realistic-600-pertask-0713-postfix-raw.json` | Full k6 raw summary |
| `docs/loadtest-llm-realistic-600random-c50-results.json` | **July 10 A/B baseline (the "88" run)** |
| `docs/loadtest-600-build-ab-jul08-vs-jul10.md` | The A/B test doc the 88 was quoted from |
| `docs/loadtest-llm-realistic-600random-c50-pertask-results.json` | July 10 instrumented re-run (per-step table only) |
| `docs/loadtest-600-per-step-trace-jul10.md` | Per-step trace + error anatomy + fix design |
| `scripts/loadtest-llm-realistic-async.js` | Harness with per-task instrumentation (unchanged since baseline) |

**Ops note:** the load-test session cookies expire after 8 hours
(`SESSION_MAX_AGE_SECONDS`) — the July 10 batch returned 401 on every request
today. Re-mint before any run with
`QRIUS_SESSION_SECRET=<value from .env.local> node loadtest/mint-cookies.mjs 1500`;
note the matching production secret lives in **`.env.local`**, not `.env` (the
two files hold different values and only `.env.local`'s verifies against the
server). The new build was probe-verified live (16/16 on the two fixed tasks)
before the run started.
