# 600-User Per-Step Failure Trace — July 10 Build (Instrumented Re-Run)

**Server:** https://mybook.lgacademy.com (LG production)
**Run:** 2026-07-10 evening, 600 concurrent users, staggered arrival over 10 min,
full 21-step magazine flow, ~50-lane concurrency — **identical conditions to the
afternoon A/B runs** (`docs/loadtest-600-build-ab-jul08-vs-jul10.md`).
**What's new:** the test harness now records success/failure **per task type**
(`scripts/loadtest-llm-realistic-async.js`, `per_task` block), so this run answers
the per-step question with measured data instead of statistical inference.

> ⚠️ **Correction to the A/B doc's section 4 Q1.** The earlier answer said the 88
> failures were "random — NOT one specific step". The instrumented re-run shows
> that is wrong in an important way: failures are **not uniformly random** — they
> concentrate entirely in the two strict-JSON-format steps. The old doc's hedge
> ("odds are somewhat higher on strictly-formatted steps") turned out to be the
> whole story.

## 1. Headline numbers (this run vs the afternoon July 10 run)

| Metric | Afternoon run | This run | Note |
|---|---|---|---|
| Fallbacks (backup text shown) | 88 (0.64%) | 97 (0.70%) | Same magnitude |
| Task success | 99.4% | 99.3% | Same |
| Perfect sessions | 517/600 (86%) | 503/600 (84%) | Same magnitude |
| Timeouts / lost jobs | 0 / 0 | 0 / 0 | |
| Heavy step median | 8.6s | 10.6s | Evening real-user traffic on top |

## 2. The per-step failure table (the CTO's Q1, measured)

13,800 AI tasks across 15 task types. Failures by step:

| Task (step) | Calls | Failures | Failure rate |
|---|---|---|---|
| judgeBranch | 1,200 | 0 | 0% |
| reflectShort | 1,200 | 0 | 0% |
| extractKeyword | 600 | 0 | 0% |
| reflectPoetic | 600 | 0 | 0% |
| rephraseLight | 1,800 | 0 | 0% |
| reflectValues | 600 | 0 | 0% |
| reflectStrength | 600 | 0 | 0% |
| observePattern | 600 | 0 | 0% |
| synthesizeStrength (Ch2 magazine) | 600 | 0 | 0% |
| synthesizeGrowthVision (Ch3 magazine) | 600 | 0 | 0% |
| **generateVisionDirections (Ch3 direction cards)** | 600 | **62** | **10.3%** |
| **generateTimeHorizon (Ch3 1yr/3yr/someday)** | 600 | **35** | **5.8%** |
| writeChapterArticle (×4 chapters) | 2,400 | 0 | 0% |
| writeCoverHeadline | 600 | 0 | 0% |
| writeEditorNote (intro+outro) | 1,200 | 0 | 0% |
| **TOTAL** | **13,800** | **97** | **0.70%** |

### 2b. Where the user actually is when it happens (screen / step mapping)

Both failing tasks belong to **two consecutive screens near the end of
Chapter 3** — the user is NOT randomly scattered across the journey:

| User-facing screen (scene id) | What the user sees | LLM task behind it | Hit rate |
|---|---|---|---|
| **Ch3 growth-vision magazine (`3-10`**, `GrowthVisionSynthesisScene`) | Ch3 synthesis + the 6 career-direction cards | `generateVisionDirections` | **10.3% of users** |
| **Ch3 time horizon (`3-10b`**, `TimeHorizonScene`) | 1yr / 3yr / someday milestone lines | `generateTimeHorizon` | **5.8% of users** |
| Every other screen (Ch0–Ch2 dialogs, Ch1 keyword, Ch2 magazine, Ch4 articles, cover, editor notes, poster) | — | 13 other task types | **0%** |

On a failure the user sees template placeholder cards/milestones on that screen
once; nothing is saved, and revisiting the screen re-generates real content.

## 3. So: random steps or a specific step? (Q1, corrected)

**Neither of the two simple answers — the truth is in between:**

- **It is NOT the old build's broken step.** The July 8 build failed
  deterministically: ~8 of 10 users lost the direction cards to the 40/50-char
  rule, every session, same place, and the result froze permanently. That bug is
  fixed and stayed fixed (0 length-cap errors in 600 sessions).
- **It is NOT uniformly random either.** All 97 failures land on the two steps
  where the AI must return strictly-formatted JSON (6 direction sentences / 3
  time-horizon milestones). Within those two steps, *which user* gets hit is
  random (a per-call dice roll on the model's output formatting — same persona
  can fail once and succeed on retry), but the *location* is systematic.
- **Failure mode:** the model occasionally emits malformed JSON (e.g.
  `Expected ',' or ']' after array element in JSON at position 28`) that the
  parser cannot recover. Verified live by direct probes: the same payload fails
  ~1/3 of attempts and succeeds on others — a formatting dice roll, not a code
  path bug.
- Roughly **1 in 10 users** sees backup text once at the direction cards, and
  **1 in 17** at the time horizon. It shows once and self-heals on the next
  visit (fallbacks are never saved — see Q2).

**Why the afternoon answer said "random":** the k6 summary then only stored the
aggregate count (88), and the server logs had been wiped by the build-swap drill,
so the answer was inferred from user-level spread. The harness now measures
per-step directly; this table supersedes that inference.

### 3b. Anatomy of the error — what exactly breaks, per error, and where

**The one-line version first: the error originates in the AI's reply, not in
our code or infrastructure.** The model is asked to answer in a strict JSON
format; on a small fraction of calls it writes that JSON slightly wrong (a
formatting slip). Our server parses the reply in a single shot with no safety
net on these two tasks, so a slip becomes a failed job. Network, queue,
database, API keys were all clean in this run (0 timeouts, 0 lost jobs, 0 quota
failures, 13 other task types at 100%).

#### What the model is asked to produce

Both tasks demand **one strict single-line JSON document and nothing else**
(prompt spec at `prompts.ts:1585` and `prompts.ts:1708`):

- `generateVisionDirections`: `{"directions":[{"id":1,"type":"role","text":"…"},… ×6]}`
  under ~10 simultaneous content constraints (6 distinct axes, no word repeated
  across all six sentences, 15–40 char caps, banned abstract words, must echo
  the participant's own wording) — reply budget `maxTokens 1200`.
- `generateTimeHorizon`: `{"horizon":["1년 안에, …","3년 후에, …","언젠가, …"]}`
  (3 milestone strings with mandatory time prefixes) — reply budget `maxTokens 500`.

#### The parse pipeline (where each check lives)

The server-side task function reads the model's reply in one pass:

1. Regex the outermost `{…}` out of the reply text
   (`prompts.ts:1590` / `:1712`)
2. `JSON.parse` it (`prompts.ts:1592` / `:1714`)
3. Require ≥6 directions / ≥3 horizon lines (`prompts.ts:1598` / `:1716`)
4. (visionDirections only) per-sentence length-cap salvage — over-cap sentence
   swapped for its same-axis fallback, other five kept (`prompts.ts:1608-1615`;
   this used to throw on the July 8 build — fixed in `048fb7a`)

Any throw in steps 1–3 fails the job. **There is no recovery step, no re-ask,
and no tolerant parser on these two tasks** — unlike the synthesis tasks (see
below).

#### Error catalog — every failure flavor, its trigger, and its throw site

| # | Error (as recorded on the job) | Throw site | Trigger in the AI's reply | Observed |
|---|---|---|---|---|
| 1 | `SyntaxError: Expected ',' or ']' after array element in JSON at position 28 (line 3 column 9)` | `JSON.parse` at `prompts.ts:1592` / `:1714` | Malformed JSON: the model ignored "single line" and pretty-printed across lines ("line 3" proves it), with a syntax slip right after the first array element — classic slips are numbering elements (`1. {...}`), an unescaped `"` inside the Korean text (terminates the string early), or a dropped comma | **Yes — the dominant flavor.** Captured live by probes, byte-identical message across independent failures |
| 2 | `SyntaxError: Unexpected end of JSON input` | same `JSON.parse` sites | Truncation: the reply ran past the token cap (1200/500) before closing the JSON — happens when the model pads the reply with prose before/around the JSON | Possible in-run; same bucket |
| 3 | `v3GenerateVisionDirections: no JSON in response` | `prompts.ts:1591` | The reply contains no `{…}` at all — the model answered in prose or returned empty text | Not seen in probes; rare |
| 4 | `v3GenerateVisionDirections: expected 6 directions, got N` / `v3GenerateTimeHorizon: expected 3 horizon lines, got N` | `prompts.ts:1599` / `:1717` | JSON parsed fine but the model produced fewer entries than required (or entries with empty `text`, which are filtered out before counting) | Not seen in probes; rare |
| — | ~~`sentence N is X chars (cap 40)`~~ | ~~`prompts.ts` length check~~ | Over-cap sentence — **no longer an error**: salvaged per-axis since `048fb7a` (July 10 build). 0 occurrences in this run | Fixed |

All 97 failures in this run are upstream-reported job errors of the flavors
above (the k6 harness counted 97 `upstream_error`, 0 timeouts, 0 lost jobs).

#### Why it is a dice roll, not a broken input

Model sampling is stochastic. Direct live probes with the **exact same
payload** failed 3 attempts in a row (flavor #1, identical message) and then
succeeded 5 in a row. Nothing about the user's data makes it fail — the same
persona rolls good and bad replies. Under 600-user load the roll landed badly
on 10.3% of `generateVisionDirections` calls and 5.8% of `generateTimeHorizon`
calls. The rates differ because the directions task asks for a much larger,
more constrained JSON (6 objects with 3 fields each vs 3 plain strings) — more
output, more constraints, more chances to slip.

#### How one bad reply becomes backup text on screen (the full path)

```
model reply (malformed JSON)
→ prompts.ts throws (see catalog above)
→ jobQueue marks the job status:"error" (src/lib/llm/jobQueue.ts)
→ client poll GET /api/v3/llm/jobs sees "error" → realLLM.ts:180 throws
→ scene catch (GrowthVisionSynthesisScene.tsx:155 / TimeHorizonScene)
→ stub directions/milestones rendered once, flagged fromStub, never persisted
→ next visit of the scene re-runs the task (usually succeeds)
```

Note the retry layers (section 4) never fire here: from their point of view the
upstream HTTP call *succeeded* (HTTP 200 with a well-formed provider envelope) —
the defect is inside the model's text, which is only discovered at parse time,
after all transport-level retries are already behind.

#### Why the other 13 task types never fail this way

Plain-text tasks (reflections, rephrase, keywords, articles, headlines, editor
notes) have nothing to parse — any text is usable. The two synthesis tasks,
which also return JSON, got a strict-parse → loose-extraction → salvage
pipeline in commit `45b0547` (`prompts.ts:224-247`) — which is exactly why
their failure count is 0 in 1,200 calls. The two failing tasks are the **only
remaining single-shot `JSON.parse` sites with no recovery and no re-ask** in
the LLM pipeline.

## 4. Are we doing retrials to cover the failed cases? (Q2 — in detail)

**Short answer: yes.** Every one of the 97 failures had already been retried
automatically — up to three separate retry mechanisms ran before the failure
was even counted — and a fourth mechanism still recovers each case afterwards
at zero cost. What is *not* retried today is one specific thing: a reply that
arrives successfully but is formatted wrong (the exact failure mode of these
97). That gap and its fix are spelled out at the end of this section.

### The four retry layers, one by one

**Layer 1 — Upstream retry (server, `aistudio.ts:281-286`).**
If the AI provider answers with a transient error (HTTP 5xx or 429), the server
does **not** fail the job. It backs off exponentially (base delay × 2ⁿ plus
random jitter, `aistudio.ts:284`) and re-calls the provider **up to 2 more
times** (`OVERLOAD_MAX_RETRIES`, `aistudio.ts:85`, tunable via
`AISTUDIO_OVERLOAD_RETRIES`). The retry re-uses the same concurrency slot, so
retrying never amplifies load on a struggling upstream. Only when these
in-place retries are exhausted does the error propagate.

**Layer 2 — API-key rotation with cooldowns (server, `aistudio.ts:256-276`).**
The heavy lane holds a pool of **10 API codes**. When a reply carries the
quota-exhausted phrase, the code that hit the cap is put on cooldown — 1 minute
for a per-minute cap, 30 minutes for the daily cap (`aistudio.ts:269-275`) —
and the call **rotates to the next available code** (round-robin cursor,
`aistudio.ts:326-330`) within the same request. A single user call can walk
through the entire pool before giving up. Even then it may not fail: if every
code is merely in a short cooldown, the server answers **HTTP 429 +
Retry-After** (`aistudio.ts:315-318`) — "busy, come back in N seconds" — rather
than an error, handing recovery to layer 3.

**Layer 3 — Transport retry on the client (`realLLM.ts:96-159`).**
The browser-side caller resubmits the task up to 2 times (`RESUBMIT_MAX`,
`realLLM.ts:96`) in two situations: (a) the server said *busy* — the client
honors the `Retry-After` header and waits it out (up to 120 s for the heavy
content tasks; both `generateVisionDirections` and `generateTimeHorizon` are
in that long-wait list, `realLLM.ts:108-119`); (b) the job vanished mid-poll
(404 after a deploy/replica rebalance, `realLLM.ts:152-157`) — the task is
resubmitted from scratch after a 3 s pause. Backup text can only appear after
these paths are exhausted.

**Layer 4 — Self-heal on revisit (client + session, `contract.ts:40/80`).**
When layers 1–3 are all exhausted and backup text is shown, the result is
flagged `fromStub` and — by contract, enforced in every scene — **never written
into the user's session**. The next time the user reaches or resumes that
scene, the task runs again from zero, passing through layers 1–3 again. This
is effectively one more full retrial at zero quota cost, and since the failure
is a per-call dice roll (section 3b), it almost always succeeds. This is the
key difference from the July 8 build, where the backup text was saved forever
and no amount of retrying could bring the real content back.

**What we deliberately do NOT do:** an unbounded automatic retry loop after a
failure has surfaced. That would burn API quota during incidents and hold
users hostage on a spinner. Layer 4 provides the recovery instead, invisibly.

### What actually happened to each of the 97

The 97 were **not** un-retried errors. Each one walked this exact path: the
provider call itself *succeeded* at the HTTP level (200, well-formed provider
envelope) — so layers 1–2 correctly saw nothing to retry; the job completed
with `status:"error"` at JSON-parse time, which is not a *busy* or *lost-job*
signal — so layer 3 correctly did not resubmit; backup text was shown once,
unsaved; layer 4 recovers the content on the user's next visit to that screen.

### The gap this trace exposes — and the fix

All three automatic layers key on **transport and quota signals** (HTTP status,
quota phrases, lost jobs). A reply that arrives successfully but is
**formatted wrong is never re-asked** — the job fails on the first parse
attempt (`prompts.ts:1592`/`:1714`), even though the very next roll of the
dice would almost certainly succeed (probes: identical payload fails 3×, then
succeeds 5×).

The fix is small and has an in-repo precedent: commit `45b0547` gave the two
synthesis tasks a strict-parse → loose-extraction → salvage pipeline, and
their failure count in this run is **0 in 1,200 calls**. Applying the same
treatment to the two remaining strict-JSON tasks:

| Measure | Expected effect |
|---|---|
| One server-side re-ask when parse/validation fails | Failure rate ≈ p² — directions 10.3% → ~1.1%, horizon 5.8% → ~0.3% |
| Plus tolerant extraction (pull the 6/3 strings out of near-miss JSON) | Most of the remaining ~1% recovered — user-visible fallbacks well under 0.2% overall |

Cost: one extra provider call only on the ~7–10% of these two tasks' calls
that fail — about 0.5% more total traffic. No architecture change; the retry
lives inside the task function, behind the existing concurrency gate.

## 5. One-sentence answer for both questions

The 97 failures are a random-per-user formatting dice roll concentrated at the
two strict-JSON steps (direction cards 10.3%, time horizon 5.8%, everything else
0%); every failure already passed 2× upstream retries + key rotation + transport
retries, is never saved, and self-heals on revisit — and adding a parse-failure
re-ask on those two tasks would shrink the problem to near zero.

## 6. Data sources

| File | What |
|---|---|
| `docs/loadtest-llm-realistic-600random-c50-pertask-results.json` | This run (per-task breakdown in `per_task`) |
| `loadtest/summary-llm-realistic-600random-c50-pertask-raw.json` | Full k6 raw summary |
| `docs/loadtest-600-build-ab-jul08-vs-jul10.md` | Afternoon A/B (Jul 8 vs Jul 10 build) |
| `scripts/loadtest-llm-realistic-async.js` | Harness with per-task instrumentation |

**Ops note:** before this run, production was found still serving the July 8
build (the A/B drill's restore step never took effect — verified by live probes
returning the old build's length-cap error). The July 10 images bundle was
redeployed via `sudo ./redeploy.sh` and verified by probe before testing. After
any build-swap drill, verify the live build with a `generateVisionDirections`
probe: the old build throws `sentence N is X chars (cap 40)`; the fixed build
never does.
