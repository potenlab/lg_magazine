# Cold-Load Baseline — Magazine STORY / Vision Express

**Established:** 2026-05-28  
**Build used:** Turbopack / Next.js 16.2.3, branch `asset-diet-and-compression`  
**Purpose:** Reference manifest for the 1,000-user load capacity effort. All future
optimisation work measures against the totals in this document.

---

## Why the Old k6 Number Was a Phantom

The previous `COLD_LOAD_ASSETS` list in `loadtest/realistic-stress-test.js` included:

```
/fonts/v3/NotoSerifKR-Regular.woff2   ← 13.4 MB
/fonts/v3/NotoSerifKR-Medium.woff2    ← 13.4 MB
/fonts/v3/Pretendard-Regular.woff2    ←  748 KB  (wrong path)
/fonts/v3/Pretendard-Bold.woff2       ←  773 KB  (wrong path)
```

These files live in `public/fonts/v3/` and are referenced **only** in
`src/lib/v3/pdf/fonts.ts` for server-side react-pdf document rendering. A browser
visiting the magazine page never requests them. The two NotoSerifKR woff2 files
alone total **≈ 26.8 MB per cold visit** — more than the entire real cold-load
payload. On top of that, the actual fonts the page loads are emitted by `next/font`
to `/_next/static/media/` with content-hashed filenames, which the old test never
fetched at all.

Result: at 100 VUs the old test reported **126 Mbps sustained** — a measurement
of non-existent traffic. The real honest number is documented below.

---

## Corrected Cold-Load Asset Manifest

Assets are grouped by how they are fetched. Sizes are **raw (uncompressed)**
unless the asset is served compressed by nginx (`gzip_static` / `brotli_static`),
in which case both raw and gzip-9 sizes are shown.

### 1. JS / CSS chunks — discovered dynamically by `setup()`

Fetched immediately when the browser processes the landing HTML. Content-hashed
filenames change on every `bun run build`; `setup()` discovers them by parsing
the HTML and (for the dynamic V3App bundle) doing a second-pass scan of the
page-route chunk. **Do not hardcode these URLs** — they are stale after each build.

| Asset | Class | Raw (bytes) | Gzip-9 (bytes) |
|---|---|---:|---:|
| `/_next/static/chunks/0vdl30fil_0l~.js` ¹ | JS (V3App bundle) | 1,830,350 | 588,344 |
| `/_next/static/chunks/0yoi6g0rt32bk.js` | JS (react-dom etc.) | 227,314 | 70,808 |
| `/_next/static/chunks/0drmebz6v4i8_.js` | JS (framework) | 194,884 | 48,539 |
| `/_next/static/chunks/03~yq9q893hmn.js` | JS (polyfills/nomodule) | 112,594 | 39,373 |
| `/_next/static/chunks/0d3tkj33oycf2.js` | JS (shared) | 57,741 | 13,743 |
| `/_next/static/chunks/0jst5_~zv2qq0.css` | CSS (global) | 54,876 | 11,116 |
| `/_next/static/chunks/0khp-2t88oexr.js` | JS (route prefetch) | 22,934 | 7,615 |
| `/_next/static/chunks/turbopack-0v_x-b34oa4on.js` | JS (turbopack runtime) | 10,547 | 4,140 |
| `/_next/static/chunks/0b2ae.cf.gt_6.js` | JS (/ page route) | 6,751 | 2,548 |
| **JS/CSS subtotal** | | **2,517,991** | **786,226** |

¹ Not present in initial HTML; loaded via `dynamic(ssr:false)` when V3App hydrates.

> **Note:** sub-300-byte runtime shims (e.g. `0fsi8lw5utejl.js`, 282 B — Turbopack `warnOnce`) are excluded from this table as negligible.

### 2. Fonts — preloaded from `<head>` via `next/font`

Emitted to `/_next/static/media/` with content-hashed filenames. Discovered
dynamically by `setup()` via the HTML `<link rel="preload" as="font">` tags.
Fonts are binary and already compressed — served raw (no nginx gzip benefit).

| Asset | Class | Raw (bytes) |
|---|---|---:|
| `/_next/static/media/NanumSeongSirCe-s.p.07l4w_3jte.-8.ttf` | Font (TTF) | 4,766,888 |
| `/_next/static/media/PretendardVariable-s.p.0a.~5ku~863u1.woff2` | Font (woff2) | 2,057,688 |
| `/_next/static/media/RIDIBatang-s.p.0oil4glx.v94v.woff2` | Font (woff2) | 457,732 |
| **Fonts subtotal** | | **7,282,308** |

#### After font diet (Task 1, 2026-05-28)

All three web fonts were subset to the **full Hangul Syllables block (U+AC00–U+D7A3,
11,172 modern syllables)** plus Latin (U+0000–00FF), Hangul Jamo (U+1100–11FF) +
Compatibility Jamo (U+3130–318F), general/CJK punctuation (U+2000–206F, U+3000–303F),
currency (U+20A0–20BF), geometric shapes (U+2500–25FF), and fullwidth forms
(U+FF00–FFEF). This drops hanja, CJK extensions, and unused symbol/feature tables
while keeping **every** modern Korean syllable, so dynamic LLM-generated Korean text
cannot render as tofu. The variable Pretendard `wght` axis (45–930) is preserved.
NanumSeongSirCe was also converted TTF→woff2. Subset outputs are version-controlled
in `public/fonts/subset/` and loaded by `src/app/layout.tsx`. NanumSeongSirCe is now
`preload: false` (only used in the IntroScene letterhead, not on first paint).

| Asset | Class | Before (bytes) | After (bytes) | Δ |
|---|---|---:|---:|---:|
| NanumSeongSirCe (TTF→woff2 subset) | Font (woff2) | 4,766,888 | 2,594,848 | −45.6% |
| PretendardVariable (variable subset) | Font (woff2) | 2,057,688 | 1,765,300 | −14.2% |
| RIDIBatang (subset) | Font (woff2) | 457,732 | 394,368 | −13.8% |
| **Fonts subtotal** | | **7,282,308** | **4,754,516** | **−34.7% (−2.53 MB)** |

This lowers total cold-load weight from ~14.7 MB to ~12.2 MB. The remaining font
weight is dominated by the 11,172-glyph Hangul block, which cannot be reduced further
without risking tofu on arbitrary runtime Korean text. Note NanumSeongSirCe's 2.5 MB is
no longer preloaded, so it does not compete on the first-paint critical path.

### 3. Static public assets — hardcoded in `COLD_LOAD_ASSETS`

These paths are stable across builds (not content-hashed) and are hardcoded in
the k6 test. Update only when the app's asset set changes.

#### Logo
| Asset | Class | Raw (bytes) | Gzip-9 (bytes) |
|---|---|---:|---:|
| `/brand/magazine-story-logo.svg` | SVG | 30,897 | 11,685 |

#### Intro-phase images (loaded `priority=true` in IntroScene.tsx at first render)
| Asset | Class | Raw (bytes) |
|---|---|---:|
| `/vision_express/common/table.jpg` | Image (JPEG) | 131,357 |
| `/vision_express/common/invite_letter.jpg` | Image (JPEG) | 12,648 |

#### Owl persona frames (12 unique poses) — DEFERRED off the first-paint window (Task 3, 2026-05-28)
**No longer eager.** The `useEffect` in `V3App.tsx` that warmed all 12 unique owl
frames *on mount* now defers the whole batch to `requestIdleCallback` (with a 3 s
timeout cap, and a 1.5 s `setTimeout` fallback for browsers without it). The intro
scene (envelope/letter/register/freetext/cover) renders the letter/envelope/station/
train images only — `OwlStage` first appears once a magazine chapter scene mounts
(ch0–ch4 + closing), never during the intro — so the owl frames are **not** needed
for first paint. Deferring the batch removes ~3.65 MB from the critical first-paint
contention burst (HTML + JS + fonts + first background) and smears it just after load,
while still warming the cache before any owl scene appears, so pose changes still
don't flash empty. The preload keeps going through the Next image optimizer
(`/_next/image?url=...&w=2048&q=75`, the 2x srcset entry `OwlStage` emits) and keeps
the dedup `Set`.

Conclusion: owl frames should **not** count toward eager cold-load weight. The 3.65 MB
subtotal below is a per-visit figure for a user who reaches the magazine chapters,
fetched on idle shortly after load — not a first-paint cost.

| Asset | Class | Raw (bytes) |
|---|---|---:|
| `/vision_express/v3/owl/l-owl-02.png` | Image (PNG) | 317,236 |
| `/vision_express/v3/owl/l-owl-03.png` | Image (PNG) | 301,070 |
| `/vision_express/v3/owl/l-owl-04.png` | Image (PNG) | 284,389 |
| `/vision_express/v3/owl/l-owl-05.png` | Image (PNG) | 283,968 |
| `/vision_express/v3/owl/l-owl-06.png` | Image (PNG) | 295,027 |
| `/vision_express/v3/owl/l-owl-09.png` | Image (PNG) | 353,649 |
| `/vision_express/v3/owl/l-owl-10.png` | Image (PNG) | 313,190 |
| `/vision_express/v3/owl/l-owl-11.png` | Image (PNG) | 278,831 |
| `/vision_express/v3/owl/l-owl-12.png` | Image (PNG) | 306,200 |
| `/vision_express/v3/owl/l-owl-13.png` | Image (PNG) | 313,260 |
| `/vision_express/v3/owl/l-owl-14.png` | Image (PNG) | 309,813 |
| `/vision_express/v3/owl/l-owl-15.png` | Image (PNG) | 294,541 |
| **Owl subtotal** | | **3,651,174** |

#### Audio (lazy — loaded on first user gesture, representative of one cold visit)
| Asset | Class | Raw (bytes) |
|---|---|---:|
| `/vision_express/kokoreli777-inside-old-train-169418.mp3` | Audio (MP3) | 2,792,174 |
| `/vision_express/floraphonic-handle-paper-foley-1-172688.mp3` | Audio (MP3) | 22,221 |
| **Audio subtotal** | | **2,814,395** |

#### After audio defer + shrink (Task 2, 2026-05-28)

**Deferred off the cold-load critical path.** Verified by code inspection:

- **SFX** (`src/lib/v3/audio.ts`): `Audio` elements are constructed lazily inside
  `get()`, which only runs on a `playOnce`/`startLoop` call (i.e. a gesture/scene
  event), never at module import. `preload` was changed `"auto"` → `"none"`, so even
  after a clip is instantiated the browser does not download bytes until `.play()`.
- **BGM** (`src/components/v3/context/BGMContext.tsx`): the provider creates an
  `Audio()` with **no `src`** on mount (downloads nothing) and returns early while
  `currentBGM` is `undefined`. A `src` is only assigned once a scene supplies a track
  (chapter ≥ 2), and `preload="none"` defers that download to `.play()` — which is
  gated behind the autoplay-unblocking user gesture. So the 2.7 MB train BGM is **not**
  fetched on landing.

Conclusion: audio should **not** count toward eager cold-load weight. The 2.81 MB
"representative" audio row above is a worst-case per-visit figure for a user who
plays through chapter 2+, not a first-paint cost.

**Re-encoded the two heavy ambient tracks to mono 96 kbps** (`ffmpeg -ac 1 -b:a 96k
-map_metadata -1`); durations and filenames unchanged so all `src` paths still resolve:

| Asset | Before (bytes) | After (bytes) | Δ |
|---|---:|---:|---:|
| `kokoreli777-inside-old-train-169418.mp3` (train BGM, stereo 184k → mono 96k) | 2,792,174 | 1,457,677 | −47.8% |
| `freesound_community-train_station_outdoor_platform_birds_people-30576.mp3` (platform ambience, stereo 160k → mono 96k) | 765,600 | 460,269 | −39.9% |

Skipped: `writing-with-pen-loud.mp3` (already mono 64k — re-encoding to 96k would
enlarge it) and all <300 KB UI SFX (negligible gain). The orphaned
`freesound_community-writing-with-pen-35109.mp3` (687 KB) is not referenced by any
`src` and was left untouched.

#### After chapter-background recompression (Task 3, 2026-05-28)

The chapter-background JPEGs in `public/vision_express/common/` are **not** on the
first-paint path (they load as the participant reaches each chapter), but shrinking
them lowers total session egress and repeat-visit cost through the same constrained
pipe. The 7 referenced files > ~150 KB were re-encoded **in place** to progressive
JPEG, quality 72 (`djpeg | cjpeg -quality 72 -progressive` — mozjpeg). Filenames are
unchanged so all `src` refs still resolve. No webp/avif (WAF-blocked). Owl PNGs were
left untouched (they re-encode through the image optimizer anyway, and quality matters
for character art). Visually spot-checked the dark starfield (`Chapter03-1`), train
cabin (`chapter05`), and the gold-linework ticket — no banding/artifacts at display size.

| Asset | Before (bytes) | After (bytes) | Δ |
|---|---:|---:|---:|
| `Chapter_01-2.jpg` | 828,502 | 757,539 | −8.6% |
| `chapter05.jpg` | 243,451 | 200,534 | −17.6% |
| `departing-train.jpg` | 235,890 | 206,113 | −12.6% |
| `arriving-train.jpg` | 220,558 | 203,868 | −7.6% |
| `morning-room.jpg` | 201,106 | 174,775 | −13.1% |
| `Chapter03-1.jpg` | 168,978 | 133,055 | −21.3% |
| `Chapter03.jpg` | 165,223 | 141,099 | −14.6% |
| **Subtotal** | **2,063,708** | **1,816,983** | **−12.0% (−246,725 B / ~241 KB)** |

Skipped two >150 KB files that are **not referenced** anywhere in `src/` — dead assets,
so recompressing them yields no session-egress benefit: `vision_ticket.jpg` (314 KB; the
in-use ticket is `vision_ticket_new.jpg`, 93 KB) and `Chapter02-2.jpg` (180 KB). All other
common JPEGs are < ~150 KB and were left as-is.

---

## Total Real Cold-Load Weight

| Category | Raw bytes | Served bytes (gzip where applicable) |
|---|---:|---:|
| JS + CSS chunks | 2,517,991 | 786,226 |
| Fonts | 7,282,308 | 7,282,308 (binary, no gzip) |
| Logo SVG | 30,897 | 11,685 |
| Intro images | 143,005 | 143,005 (JPEG, no gzip) |
| Owl images (12) | 3,651,174 | 3,651,174 (PNG, no gzip) |
| Audio (representative) | 2,814,395 | 2,814,395 (MP3, no gzip) |
| **TOTAL** | **16,439,770** | **14,688,793** |

**~14.7 MB served per cold visit** (raw on wire, before TCP/TLS overhead).

---

## Bandwidth Math at 1,000 Simultaneous Cold Visitors

Assumptions:
- All 1,000 users arrive concurrently and start downloading immediately.
- Fair-share bandwidth: 500 Mbps DMZ pipe ÷ ~4 co-tenants ≈ **130 Mbps** available.
- No CDN; all bytes served directly from the app server.

```
Simultaneous load  = 14,688,793 bytes × 1,000 users
                   = 14,688,793,000 bytes total on wire
                   = 117,510,344,000 bits

Time to drain at 130 Mbps = 117,510,344,000 ÷ 130,000,000
                           ≈ 904 seconds  (~15 minutes)
```

In other words, **at full concurrency the 130 Mbps pipe takes ~15 minutes to
serve all 1,000 cold visitors**. In a realistic ramp scenario (users spread over
a 15–30 minute window) the sustained load is ~8–15 Mbps — well within budget.
The risk is a flash-crowd spike (all 1,000 hitting within seconds): that would
saturate the pipe and cause timeouts for everyone.

### Old vs New test weight comparison

| Metric | Old (phantom) test | New (honest) test |
|---|---:|---:|
| NotoSerifKR fonts included | 26,816,716 B (fake) | 0 B (correctly absent) |
| Real font bytes | 0 B (missing) | 7,282,308 B |
| Total cold-load weight | ~42 MB (phantom) | ~14.7 MB (real) |
| 100-VU sustained bandwidth | 126 Mbps (reported) | ~30–35 Mbps (expected) |

The old test's 126 Mbps at 100 VUs was primarily the NotoSerifKR phantom
(26 MB × 100 VUs = 2.6 GB data sent, saturating the pipe with non-existent browser traffic).

---

## How to Keep This Baseline Current

1. After each `bun run build`, run `k6 run --vus 1 --iterations 1 loadtest/realistic-stress-test.js`
   locally and check the `setup` log line to confirm chunk discovery is working.
2. If owl images are resized or replaced, update the owl entries and subtotals above.
3. If a new audio file is added to the intro scene, add it to `COLD_LOAD_ASSETS` and
   update the audio section.
4. Font filenames in Section 2 are illustrative — `setup()` discovers them dynamically
   and they do not need manual updating.

---

## Final result (post-effort, 2026-05-28)

**Measurement method:** CAPTURED live, not just computed. A clean production build
(`bun run build`, Turbopack/Next 16.2.3) was served from this repo's standalone output
on a free port (`node .next/standalone/server.js`, `PORT=3100`) with `QRIUS_MOCK=1` to
mint a session past the Qrius SSO gate. The served document was confirmed to be THIS app
(`<title>Magazine STORY · Vision Express</title>`, subset next/font preload links present)
and NOT the unrelated marketing site that occupies `localhost:3000`. Network bytes below
are real transfer sizes from the browser Resource Timing API (served with brotli/gzip where
the asset compresses; woff2/jpeg/png/mp3 are already-compressed binaries served raw).

### What the strategy moved off the first-paint window

The effort did **not** chase a single "total bytes" number — the lever is *what competes
during the first-paint burst*. Three large byte sources were smeared into the session:

| Moved off first paint | Bytes | Now fetched |
|---|---:|---|
| NanumSeongSirCe font (subset woff2, `preload:false`) | 2.47 MB | only when the IntroScene invite-letter renders (after envelope open) |
| Owl persona frames (12, via `/_next/image`) | ~0.75 MB optimized¹ | `requestIdleCallback` (3 s cap) / 1.5 s `setTimeout` fallback — verified firing at ~950 ms, *after* the load event (822 ms) |
| Audio (train BGM + SFX, `preload="none"`) | 0 on cold load | on the user gesture that triggers `.play()` |

¹ The 3.65 MB owl figure in Section 3 is the *source PNG* weight; the `/_next/image`
optimizer re-encodes them to ~783 KB total at `w=2048&q=75` on the wire. Either way they
are no longer on the first-paint path.

### Captured eager first-paint set

| Asset class | Wire bytes (as served) |
|---|---:|
| HTML document | 7,978 |
| JS (9 chunks in initial HTML) | 741,759 |
| CSS (1) | 11,480 |
| Fonts — Pretendard + RIDIBatang subset woff2 (the only two `rel=preload`) | 2,160,268 |
| Logo SVG | 11,926 |
| First background `table.jpg` (intro, `priority`) | 56,574 |
| **EAGER FIRST-PAINT TOTAL** | **2,989,985 B ≈ 2.85 MB** |

Live verification of the four constraints, all PASS:
- (a) Fonts referenced are the **subset woff2** (`PretendardVariable_subset`,
  `RIDIBatang_subset`) — zero `NotoSerifKR` / `Noto*` references in the document.
- (b) Only **Pretendard + RIDIBatang** carry `rel=preload`; **NanumSeongSirCe is NOT
  preloaded** (confirmed absent from `<head>` preloads).
- (c) **No `.mp3`** requested on initial load (0 media requests until a play gesture).
- (d) **No `.webp`/`.avif`** by URL (WAF constraint intact); the 12 owl requests all route
  through `/_next/image` and fire post-load on idle, not synchronously on mount.

### Before / after

| Metric | Baseline (pre-effort) | After effort |
|---|---:|---:|
| Total cold-load weight (all assets, incl. fonts/owls/audio) | ~14.7 MB | ~12.2 MB total session¹ |
| **Eager first-paint weight** (competes during first paint) | ~14.7 MB² | **~2.85 MB (captured)** |

¹ Total session weight drops via the font diet (−2.53 MB), audio re-encode (−1.6 MB), and
background recompression (−241 KB); see Sections 2–3.
² The old baseline did not separate eager from deferred — fonts (incl. the 4.8 MB
NanumSeongSirCe TTF), owls, and audio were all treated as cold-load weight. The whole point
of this effort is that the new ~2.85 MB is the *only* set racing for first paint; the rest is
now deferred into the session.

### 1000-user bandwidth math (eager first-paint only)

Assumptions unchanged: flash-crowd worst case, all 1,000 users arrive at once; fair-share
≈ 130 Mbps of the 500 Mbps DMZ pipe.

```
Eager bytes        = 2,989,985 B × 1,000 users = 2,989,985,000 B = 23,919,880,000 bits
Drain at 130 Mbps  = 23,919,880,000 ÷ 130,000,000 ≈ 184 s  (~3.1 min)
Drain at full 500  = 23,919,880,000 ÷ 500,000,000 ≈ 48 s
```

vs the old eager baseline (~14.7 MB → 117.5 Gbit → **~904 s / ~15 min** at 130 Mbps). The
first-paint contention window for a 1,000-user flash crowd shrinks **~5x** (~15 min → ~3 min),
and the deferred bytes (owls/Nanum/audio) now smear across the session instead of piling onto
the opening burst. Realistic ramped arrivals stay comfortably within budget.

### Verdict

Sound and ready to deploy. The dominant remaining eager cost is the 2.16 MB of preloaded
Korean fonts (Pretendard + RIDIBatang), which is the floor for tofu-safe full-Hangul coverage.
Remaining **optional** levers (not done, left to the user's judgement):

- Set **RIDIBatang `preload:false`** too (−0.39 MB eager). It is a serif used in body/headers
  shortly after paint, so this trades a brief FOUT/swap for fewer first-paint bytes.
- Subset fonts to **KS X 1001 (2,350 common syllables)** instead of the full 11,172-syllable
  Hangul block — a much larger font cut, but rare/archaic syllables (and some LLM-generated
  text) could render as tofu. Higher risk; needs product sign-off.
- Lazy-load / route-split the **V3App bundle further** if first-paint JS becomes a concern.
- The orphaned `freesound_community-writing-with-pen-35109.mp3` (687 KB) and dead JPEGs
  (`vision_ticket.jpg`, `Chapter02-2.jpg`) can be deleted to trim repo/deploy size (no runtime
  effect — not referenced).
