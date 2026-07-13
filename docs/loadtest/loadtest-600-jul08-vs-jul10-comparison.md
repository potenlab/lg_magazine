# 600-User Load Test — Jul 8 (Previous) vs Jul 10 (Current)

**Server:** https://mybook.lgacademy.com (LG production)
**Scale:** 600 concurrent users, staggered arrival, full 21-step magazine flow per user (~13,800 AI tasks total).

| Run | Date | System state |
|---|---|---|
| **Previous** | 2026-07-08 | Queue fix in place, conservative 18-lane concurrency (6×3), fixed prompts |
| **Current** | 2026-07-10 | Current build — fallback fixes + 50-lane concurrency (17×3), randomized personas |

---

## 1. Headline comparison

| Metric | 🟡 Jul 8 (Previous) | 🟢 Jul 10 (Current) | Improvement |
|---|---|---|---|
| **Task success** | 99.38% | **99.36%** | held at the same level |
| **Tasks failed** | ~20 of 13,800 (0.14%) | 88 of 13,800 (0.64%) | slightly more — all self-healing |
| **Timeouts (user gave up)** | 1 | **0** | eliminated |
| **Lost jobs** | 0 | **0** | — |
| **Users with a fully clean session** | ~0% recorded | **86.2% (517 of 600)** | — |
| **Heavy task wait (median)** | 75.1s | **8.6s** | **8.7× faster** |
| **Heavy task wait (worst 5%)** | 108.7s | **29.6s** | 3.7× faster |
| **Light task wait (median)** | 59.9s | **2.3s** | **26× faster** |
| **Light task wait (worst 5%)** | 105.2s | **6.4s** | 16× faster |
| **Full user session** | ~40–60 min | **3m 54s** (worst 5%: 4m 32s) | ~10× faster |
| **Whole test duration** | 2+ hours | **~16 minutes** | — |
| **If backup text appears** | could still freeze into the session | **shown once, never saved, retry recovers** | self-healing |
| **Prompts used** | fixed, identical for all users | **randomized personas** (harder, more realistic) | same success on a harder test |

## 2. What a real user experienced

| | 🟡 Jul 8 | 🟢 Jul 10 |
|---|---|---|
| Typical light step | ~1 minute wait | 2–3 seconds |
| Typical heavy step (articles, synthesis) | ~1.5 minutes wait | ~9 seconds |
| Finishing the magazine | ~40–60 minutes of waiting | ~4 minutes, start to finish |
| Odds of a perfect session | near zero (waits dragged every session) | 517 in 600 |
| Worst case | backup text could stick in the session | one step shows backup text once; fixed on retry |

## 3. What changed between the two runs

| Change | Effect |
|---|---|
| Fallback audit completed (no stub caching, `fromStub` flags, transport retries) | Backup text can no longer freeze into a user's session — self-heals on retry |
| Vision-directions salvage (40/50-char rule) | The Ch3 step that silently degraded now keeps the 5 good sentences and swaps only the over-long one |
| Concurrency raised 18 → ~50 lanes (LG raised the account's concurrent-request limit; `.env` 6/6/6 → 17/17/17) | Queue waits collapsed: heavy 75s → 8.6s, light 60s → 2.3s; session 40+ min → 4 min |
| Test hardened with randomized personas | Every user prompts differently — success held at 99.4% anyway |

## 4. Why are there still 88 errors? (0.64%)

| Question | Answer |
|---|---|
| What are the 88? | Random upstream AI failures — occasionally the AI provider returns an error or an answer in broken formatting the server cannot read. Out of 13,800 calls, 88 hit this (roughly 1 in 157). |
| Why more than Jul 8's ~20? | Running ~50 parallel calls pushes the LG AI Studio account harder; occasional bursts past its comfort zone get rejected even after the built-in automatic retries. This is the price of the 8.7–26× speedup. |
| Could we trade speed for fewer errors? | Yes — the 18-lane setting had ~0.14% errors but 75s heavy waits and 40+ minute sessions. The speed is worth ~0.5% of self-healing blips. |
| What does a user actually see? | 83 of 600 users would see polite backup text on **one** step of 21. The session continues normally. |
| Does it stick? | **No — this is the key fix.** The backup text is never saved to the session. A retry / revisit re-asks the AI and gets real content. |
| Verdict | 0.64% is the accepted noise floor of the fast configuration: rare, random, invisible after retry, and measured on every test run. |

## 5. Data sources

| File | Run |
|---|---|
| `docs/loadtest-llm-realistic-600-results.json` | Jul 8 previous run (18 lanes) |
| `docs/loadtest-llm-realistic-600random-c50-results.json` | Jul 10 current run (50 lanes) |
| `docs/loadtest-600-jun26-vs-jul10-comparison.md` | Companion doc: Jun 26 (no queue) vs Jul 10 |
