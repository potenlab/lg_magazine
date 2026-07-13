# 600-User Load Test — Jun 26 (Before) vs Jul 10 (Current)

**Server:** https://mybook.lgacademy.com (LG production)
**Scale:** 600 concurrent users, staggered arrival, full 21-step magazine flow per user (~13,800 AI tasks total).

| Run | Date | System state |
|---|---|---|
| **Before** | 2026-06-26 | Old code — no job queue, direct AI calls |
| **Current** | 2026-07-10 | Current build — job queue + fallback fixes + 50-lane concurrency (17×3), randomized personas |

---

## 1. Headline comparison

| Metric | 🔴 Jun 26 (Before) | 🟢 Jul 10 (Current) | Improvement |
|---|---|---|---|
| **Task success** | 28.7% | **99.4%** | +70.7 points |
| **Tasks failed** | ~9,800 of 13,700 | **88 of 13,800** | ~110× fewer |
| **Server errors** | 4,156 | **88** | 47× fewer |
| **Timeouts (user gave up)** | 170 | **0** | eliminated |
| **Lost jobs** | 2 | **0** | eliminated |
| **Users with a fully clean session** | ~0% | **86.2% (517 of 600)** | — |
| **Heavy task wait (median)** | 123s | **8.6s** | 14× faster |
| **Heavy task wait (worst 5%)** | 245s | **29.6s** | 8× faster |
| **Light task wait (median)** | 93.5s | **2.3s** | 41× faster |
| **Full user session** | broken — effectively never finished | **3m 54s** (worst 5%: 4m 32s) | unusable → ~4 min |
| **If backup text appears** | frozen into the user's magazine forever | **shown once, never saved, retry recovers** | self-healing |
| **Prompts used** | fixed, identical for all users | **randomized personas** (harder, more realistic) | — |

## 2. What a real user experienced

| | 🔴 Jun 26 | 🟢 Jul 10 |
|---|---|---|
| Typical step | Wait 1.5–4 minutes… then often an error | 2–9 seconds, real content |
| Finishing the magazine | Practically impossible under load | ~4 minutes, start to finish |
| Odds of a perfect session | ~0 in 600 | 517 in 600 |
| Worst case | Generic backup text saved into the magazine permanently | One step shows backup text once; fixed on retry |

## 3. What changed between the two runs

| Fix | Effect |
|---|---|
| Async job queue (202 + polling) | Stopped the AI provider from being flooded — failures 71% → <1% |
| Fallback audit (no stub caching, `fromStub` flags, transport retries) | Backup text can no longer freeze into a user's session — self-heals on retry |
| Vision-directions salvage (40/50-char rule) | The Ch3 step that failed for ~everyone now keeps the 5 good sentences and swaps only the over-long one |
| Concurrency raise 18 → ~50 lanes (LG account limit raised) | Queue waits collapsed: heavy 75s → 8.6s; session 40+ min → 4 min |

## 4. Why are there still 88 errors? (0.64%)

| Question | Answer |
|---|---|
| What are the 88? | Random upstream AI failures — occasionally the AI provider returns an error or an answer in broken formatting the server cannot read. Out of 13,800 calls, 88 hit this (roughly 1 in 157). |
| Is it the same bug as June? | No. The June failures were **systematic** (the flood of direct calls crushed the provider — 71% died). The 88 are **random noise**: no pattern, no specific step, no specific user. |
| Why not zero? | Two reasons. (1) A generative AI is never 100% predictable — malformed output happens at a low base rate on every platform. (2) Running ~50 parallel calls pushes the LG AI Studio account harder; occasional bursts past its comfort zone get rejected even after the built-in automatic retries. This is the price of the 14× speedup. |
| Could we trade speed for fewer errors? | Yes — at the old 18-lane setting the error rate was ~0.14%, but heavy steps took 75s and a session took 40+ minutes. 50 lanes ⇒ 8.6s steps, 4-minute sessions, 0.64% errors. The speed is worth ~0.5% of self-healing blips. |
| What does a user actually see? | 83 of 600 users would see polite backup text on **one** step of 21. The session continues normally. |
| Does it stick? | **No — this is the key fix.** The backup text is never saved to the session. A retry / revisit re-asks the AI and gets real content. In June, the same event froze the backup text into the user's magazine permanently. |
| Verdict | 0.64% is the accepted noise floor of the fast configuration: rare, random, invisible after retry, and monitored (the load-test counter now measures it on every run). |

## 5. Data sources

| File | Run |
|---|---|
| `docs/loadtest-llm-realistic-600-results.BEFORE-fix.json` | Jun 26 before-run |
| `docs/loadtest-llm-realistic-600-results.json` | Jul 8 previous 600-user run (18 lanes) |
| `docs/loadtest-llm-realistic-600random-c50-results.json` | Jul 10 current-run |
| `docs/loadtest-llm-realistic-20random-0708-results.json` / `...-20random-results.json` | 20-user A/B (rollback drill) |
| `docs/probe-oldbuild-0708-per-task.md` | Per-task failure evidence |
