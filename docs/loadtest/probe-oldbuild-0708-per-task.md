# Per-task probe — OLD build (lg_magazine-images-20260708-173856), 2026-07-10

Live server probe during the rollback test window. Each of the 15 LLM task
types called once via POST /api/v3/llm + poll. 14/15 succeeded; the one
systematic failure is the step that produced the 20 fallbacks in the 20-user
load test (docs/loadtest/results/loadtest-llm-realistic-20random-0708-results.json).

| Task | Status | Time | Note |
|---|---|---|---|
| judgeBranch | done | 2.3s | |
| reflectShort | done | 2.3s | |
| extractKeyword | done | 2.3s | |
| reflectPoetic | done | 2.3s | |
| rephraseLight | done | 2.3s | |
| reflectValues | done | 2.3s | |
| reflectStrength | done | 2.3s | |
| observePattern | done | 3.0s | |
| synthesizeStrength | done | 25.5s | |
| synthesizeGrowthVision | done | 30.7s | |
| **generateVisionDirections** | **error** | 6.9s | `Expected ',' or ']' after array element in JSON at position 28 (line 3 column 9)` |
| generateTimeHorizon | done | 4.6s | |
| writeChapterArticle | done | 9.2s | |
| writeCoverHeadline | done | 4.6s | |
| writeEditorNote | done | 8.1s | |

A follow-up single probe of generateVisionDirections on the old build errored
again with the same JSON message (2 errors / 3 attempts observed overall).

Failure modes on the old build (both fixed/mitigated after 048fb7a):
1. Length-cap throw — any of the 6 sentences over 40/50 chars discarded ALL six
   (dominant cause; fixed by per-axis salvage in 048fb7a, in builds >= 0709).
2. Malformed JSON from the model — rare residual (~0.2%), exists in all builds;
   harmless after the fix era because stubs are shown but never persisted.
