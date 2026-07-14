# LLM Fallback — Before/After Fix Comparison (20-User Live Test)

**Date:** 2026-07-10
**Server:** https://mybook.lgacademy.com (LG production)
**Method:** Identical load test run twice on the same day — once against the
rolled-back old build, once against the current build. 20 concurrent users,
staggered arrival over 60s, each walking the full 21-step magazine flow with
**randomized personas** (8 profiles: PM, UX designer, backend dev, marketer,
data analyst, HR, sales, content editor) so every user prompts differently.

| Build under test | Image bundle | Contains |
|---|---|---|
| **Before Fix** | `lg_magazine-images-20260708-173856.tar.gz` (Jul 8) | Pre-audit build |
| **After Fix** | `lg_magazine-images-20260710-101952.tar.gz` (Jul 10) | Fallback audit fixes (commits `048fb7a`…`2b5726f`) + magazine redesign |

---

## 1. Headline results

| Metric | Before Fix | After Fix | Improvement |
|---|---|---|---|
| Tasks attempted | 460 | 460 | same test |
| Tasks succeeded | 440 (95.65%) | 459 (**99.78%**) | +4.1 pts |
| **Fallback (backup text) shown** | **20× (4.35%)** | **1× (0.22%)** | **20× fewer** |
| Users with a fully clean session | 1 of 20 (5%) | **19 of 20 (95%)** | 19× more |
| Users who hit at least one fallback | 19 of 20 | 1 of 20 | — |
| Server-side AI errors | 20 | 1 | 95% fewer |
| Lost jobs (404) / timeouts | 0 / 0 | 0 / 0 | — |

## 2. Speed (unchanged — the fix cost nothing)

| Metric | Before Fix | After Fix |
|---|---|---|
| Light tasks — median / p95 | 2.2s / 4.3s | 2.3s / 4.4s |
| Heavy tasks — median / p95 | 8.5s / 31.5s | 8.7s / 30.0s |
| Enqueue accept — p95 | 0.19s | 0.22s |
| Full session — median / p95 | 3m47s / 4m00s | 3m45s / 3m54s |

## 3. Root cause (verified by per-task probe on the old build)

All 15 task types were probed individually on the rolled-back build:
**14 of 15 worked. One failed systematically:**

`generateVisionDirections` — the 6 career-direction cards in Chapter 3.

| | Before Fix | After Fix |
|---|---|---|
| The rule | Each of the 6 sentences must fit 40 chars (50 for the last) | Same rule |
| AI writes 1 sentence a few chars over (near-certain — LLMs can't count Korean chars) | 🔴 **All 6 sentences discarded**, error raised, user shown 6 generic backup sentences | 🟢 Only the over-长 sentence swapped for its generic twin — **other 5 personalized kept** |
| The shown fallback | 🔴 **Saved permanently** into the session — real content never returns | 🟢 Shown once, **never saved** — retry gets real content |

Fix commit: `048fb7a` — *"salvage over-cap vision directions per-axis instead
of discarding all six"* (Jul 9, 17h after the old bundle was packed).

## 4. Step-by-step: fixed or not

| # | Step | Before Fix | After Fix | Verdict |
|---|---|---|---|---|
| 1 | Ch1 story check (judgeBranch ×2) | Works | Works | ✅ already fine |
| 2 | Ch1 short reflections | Works (display-only) | Same | ✅ already fine |
| 3 | Ch1 keyword extraction | Works | Works | ✅ already fine |
| 4 | Ch1 poetic mirror | On failure, backup **frozen into session** | Never saved, self-heals | 🔧 fixed (freeze) |
| 5 | Ch2 value rephrase ×3 | Works (display-only) | Same | ✅ already fine |
| 6 | Ch2 values reflection | Freeze risk | Never saved, self-heals | 🔧 fixed (freeze) |
| 7 | Ch2 strength reflection | Freeze risk | Never saved; retry wait capped | 🔧 fixed (freeze) |
| 8 | Ch2 pattern observation | Freeze risk | Never saved, self-heals | 🔧 fixed (freeze) |
| 9 | Ch2 strength synthesis (heavy) | Works | Works | ✅ fine |
| 10 | Ch3 growth vision synthesis (heavy) | Works | Works | ✅ fine |
| 11 | **Ch3 six direction cards** | 🔴 **Crashed for ~19/20 users; generic set shown AND saved forever** | 🟢 Works; worst case shows once, never saved | 🔧 **FIXED — the big one** |
| 12 | Ch3 time horizon | Hidden fallback, unflagged | Flagged, never saved | 🔧 fixed |
| 13 | Ch4 chapter articles ×4 (heavy) | Failed article's placeholder **cached, blocking the real one** | Never cached; retry recovers | 🔧 fixed (freeze) |
| 14 | Cover headline | Works (never saved) | Same | ✅ already fine |
| 15 | Editor notes ×2 | Works (never saved) | Same | ✅ already fine |
| — | Any network hiccup | Instant backup text | Retries first | 🔧 fixed |

**Score:** Before — 1 step crashing for everyone, 7 steps freezing backups
permanently. After — 0 and 0; all 15 steps healthy.

## 5. Why 0.2% remains after the fix

The 1 remaining failure (of 460) is a different, random issue: occasionally
the AI returns its answer in broken formatting the server cannot read at all.
This is the natural noise floor of a generative model and cannot be driven to
absolute zero. It is harmless by design in the After build: the user sees
polite backup text **once**, it is **never saved**, and the next retry gets
real content (self-healing).

## 6. Evidence files

| File | Contents |
|---|---|
| `docs/loadtest/results/loadtest-llm-realistic-20random-0708-results.json` | Before-fix 20-user run (raw numbers) |
| `docs/loadtest/results/loadtest-llm-realistic-20random-results.json` | After-fix 20-user run (raw numbers) |
| `docs/probe-oldbuild-0708-per-task.md` | Per-task probe on the old build (14/15 OK, the failing step + exact error) |
| git `048fb7a` | The fix commit for the direction-cards crash |
| git `1d03865`, `6cf1477`, `ce2d965`, `c315834`, `2b5726f` | The freeze-bug (stub-cache) fix series |
