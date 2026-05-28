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

#### Owl persona frames (all 12 poses preloaded eagerly in V3App.tsx `useEffect`)
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
