// REALISTIC browse-flow stress test — each VU mimics one real user session.
//
// Difference vs stress-test.js: this script fetches what a *real browser*
// actually downloads on a cold visit — not just the /_next/static/ JS chunks.
// Per-VU caching: first iteration is a cold-load (heavy assets); subsequent
// iterations are warm-cache (HTML + API only), matching how a real user
// behaves after the first page render.
//
// Env:  BASE, VUS, RAMP, HOLD
//
// ── COLD-LOAD ASSET MANIFEST (what a browser downloads on a first visit to /) ──
//
// Sources of truth (re-verify after each `bun run build`):
//   1. HEAD assets:  .next/server/app/index.html  — fonts, JS chunks, CSS
//   2. Dynamic app bundle: the large "*.js" chunk NOT listed in the HTML but
//      referenced inside the page-route chunk (discoverable by setup() below).
//   3. Public static assets: persona.ts + IntroScene.tsx define which images
//      are loaded priority=true at first render.
//
// What is NOT a cold-load browser asset:
//   - /fonts/v3/NotoSerifKR-Regular.woff2  (13.4 MB, react-pdf TTF only)
//   - /fonts/v3/NotoSerifKR-Medium.woff2   (13.4 MB, react-pdf TTF only)
//   - /fonts/v3/Pretendard-Regular.woff2   (react-pdf only, not next/font)
//   - /fonts/v3/Pretendard-Bold.woff2      (react-pdf only, not next/font)
//   These live in /public/fonts/v3/ and are used ONLY in src/lib/v3/pdf/fonts.ts
//   for server-side react-pdf rendering. A browser viewing the magazine NEVER
//   downloads them. The old test's inclusion of the two NotoSerifKR files added
//   ~26 MB per cold visit — a phantom that inflated the 100-VU test to 126 Mbps.
//
// Font URLs are content-hashed by next/font and change on each `bun run build`.
// They are emitted to /_next/static/media/ and appear in the HTML <head> as
// <link rel="preload"> tags — they are discoverable dynamically by setup() below
// via the same HTML-parse regex it already uses for JS/CSS chunks.
//
// The V3App dynamic bundle (ssr:false) is NOT listed in the HTML — it is
// referenced inside the page-route chunk and loaded at runtime. setup() discovers
// it via a second-pass fetch of the page-route chunk (identified by the ".cf."
// Turbopack naming pattern) and a regex scan of its content.
//
// Owl images go through /_next/image (optimizer proxy), not direct /public paths.
// A real browser fetches /_next/image?url=...&w=2048&q=75 for each of the 12
// unique owl poses preloaded in V3App.tsx. These are included in COLD_LOAD_ASSETS
// as the direct public paths for simplicity (same bytes hit nginx either way).
//
// Audio is lazy (loaded only after the first user gesture — clicking the envelope).
// The train BGM (kokoreli777, ~2.7 MB) and paper SFX (~22 KB) are included as
// representative first-interaction assets; other SFX load on later scenes.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE || "https://mybook.lgacademy.com";
const VUS  = Number(__ENV.VUS || 100);
const RAMP = __ENV.RAMP || "15s";
const HOLD = __ENV.HOLD || "1m";

const cookies = new SharedArray("cookies", () => JSON.parse(open("./cookies.json")));
const PAGES = ["/", "/deep", "/gem", "/mix", "/claude", "/gem_deep", "/mix_deep"];

// Heavy assets a real browser pulls on a fresh visit.
// JS/CSS chunks and fonts are discovered dynamically by setup() via HTML parsing.
// The assets below are the public static files loaded by the app on first render.
//
// Total real cold-load weight (honest baseline, build 2026-05-28):
//   JS/CSS (gz):  ~783 KB  — setup() discovers these dynamically
//   Fonts (raw):  ~7.3 MB  — NanumSeongSirCe.ttf 4.5MB, Pretendard 2.0MB, RIDI 447KB
//   Logo SVG:       ~30 KB
//   Intro images: ~352 KB  — table.jpg + invite_letter.jpg (priority=true at envelope)
//   Owl images:  ~3.6 MB   — 12 poses × ~300 KB, preloaded by V3App on mount
//   Train BGM:   ~2.7 MB   — kokoreli777 mp3 (lazy after first gesture)
//   Paper SFX:     ~22 KB  — floraphonic paper foley (lazy after first gesture)
//   TOTAL:       ~14.8 MB raw (JS/CSS gzip saves ~1.2 MB off the text assets)
//
// See docs/cold_load_baseline.md for the full manifest table and bandwidth math.
const COLD_LOAD_ASSETS = [
  // Brand SVG (every page, priority)
  "/brand/magazine-story-logo.svg",

  // Intro phase backgrounds (loaded priority=true in IntroScene.tsx at first render)
  "/vision_express/common/table.jpg",         // envelope + letter BG, 128 KB
  "/vision_express/common/invite_letter.jpg", // envelope image, priority=true, 12 KB

  // Owl persona frames — ALL 12 unique poses preloaded eagerly on V3App mount
  // (V3App.tsx useEffect loops over personaConcept.characterImages and fires
  //  /_next/image?url=...&w=2048&q=75 for each; direct public paths used here)
  "/vision_express/v3/owl/l-owl-02.png",
  "/vision_express/v3/owl/l-owl-03.png",
  "/vision_express/v3/owl/l-owl-04.png",
  "/vision_express/v3/owl/l-owl-05.png",
  "/vision_express/v3/owl/l-owl-06.png",
  "/vision_express/v3/owl/l-owl-09.png",
  "/vision_express/v3/owl/l-owl-10.png",
  "/vision_express/v3/owl/l-owl-11.png",
  "/vision_express/v3/owl/l-owl-12.png",
  "/vision_express/v3/owl/l-owl-13.png",
  "/vision_express/v3/owl/l-owl-14.png",
  "/vision_express/v3/owl/l-owl-15.png",

  // Audio — lazy (first user gesture), but included as representative first-visit cost
  "/vision_express/kokoreli777-inside-old-train-169418.mp3", // train BGM loop, 2.7 MB
  "/vision_express/floraphonic-handle-paper-foley-1-172688.mp3", // paper SFX, 22 KB
];

const tHome     = new Trend("page_home", true);
const tNav      = new Trend("page_navigate", true);
const tAuth     = new Trend("api_auth_me", true);
const tColdAsset = new Trend("cold_assets", true);
const tWarmCycle = new Trend("warm_cycle", true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    realistic: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: HOLD, target: VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
};

export function setup() {
  const params = {
    headers: { Cookie: `qrius_session=${cookies[0]}` },
    responseType: "text",
  };

  // ── Pass 1: discover all JS/CSS/font URLs declared in the landing HTML ──
  // next/font emits content-hashed font URLs as <link rel="preload"> tags in
  // the <head>; next.js emits JS/CSS chunk URLs as <script src> and <link rel="stylesheet">.
  // All of these appear in the HTML and are captured by the regex below.
  const res = http.get(`${BASE}/`, params);
  const found = res.body
    ? res.body.match(/\/_next\/static\/[^"'\s]+\.(?:js|css|woff2|ttf)/g)
    : null;
  const headAssets = found ? [...new Set(found)] : [];

  // ── Pass 2: discover the V3App dynamic bundle ──
  // The main app bundle is loaded via dynamic import (ssr:false) so it never
  // appears in the HTML. It IS referenced inside the page-route chunk, which
  // is identified by the Turbopack ".cf." naming pattern in the HTML chunk list.
  // Fetch that chunk and scan it for additional static/chunks/*.js references.
  const pageChunk = headAssets.find((url) => url.includes(".cf."));
  let dynamicChunks = [];
  if (pageChunk) {
    const chunkRes = http.get(`${BASE}${pageChunk}`, params);
    const dynFound = chunkRes.body
      ? chunkRes.body.match(/["']static\/chunks\/([^"']+\.js)["']/g)
      : null;
    if (dynFound) {
      dynamicChunks = [...new Set(
        dynFound.map((m) => "/_next/" + m.replace(/["']/g, ""))
      )].filter((url) => !headAssets.includes(url));
    } else {
      console.warn(
        "[setup] WARNING: page-route chunk was fetched but yielded no static/chunks/*.js matches — " +
        "the ~1.8 MB V3App dynamic bundle will be MISSING from this test. " +
        "Cold-load weight is understated. Inspect the page-route chunk content and update the regex."
      );
    }
  } else {
    console.warn(
      "[setup] WARNING: page-route chunk not found via '.cf.' heuristic — " +
      "the ~1.8 MB V3App bundle will be MISSING from this test. " +
      "Cold-load weight is understated. Inspect the built index.html and update the heuristic."
    );
  }

  const allChunks = [...headAssets, ...dynamicChunks];
  console.log(
    `setup: ${res.status}, ${allChunks.length} JS/CSS/font chunks ` +
    `(${headAssets.length} from HTML + ${dynamicChunks.length} dynamic), ` +
    `${COLD_LOAD_ASSETS.length} static assets`
  );
  return { jsChunks: allChunks };
}

export default function (data) {
  const cookie = cookies[__VU % cookies.length];
  const params = { headers: { Cookie: `qrius_session=${cookie}` } };

  // __ITER is k6's per-VU iteration counter (starts at 0).
  // First iteration = cold visit (full asset fan-out).
  // Subsequent iterations = warm cache (HTML + API only).
  const isColdVisit = __ITER === 0;

  group("landing", () => {
    const res = http.get(`${BASE}/`, { ...params, tags: { name: "home" } });
    tHome.add(res.timings.duration);
    check(res, { "home 200": (r) => r.status === 200 });
  });

  if (isColdVisit) {
    // === COLD-LOAD: fetch JS/CSS/font chunks + all heavy assets in parallel ===
    // This matches what a real browser does on first page render.
    group("cold-fanout", () => {
      const allAssets = [...data.jsChunks, ...COLD_LOAD_ASSETS];
      const reqs = allAssets.map((path) => ({
        method: "GET",
        url: `${BASE}${path}`,
        params: { ...params, tags: { name: "cold_asset" } },
      }));
      const start = Date.now();
      const responses = http.batch(reqs);
      tColdAsset.add(Date.now() - start);
      check(responses[0], { "asset 200": (r) => r.status === 200 });
    });
  } else {
    // === WARM CYCLE: HTML + auth + page nav (no heavy assets) ===
    // Mimics a user navigating between chapters with cached assets.
    const start = Date.now();

    group("auth-check", () => {
      const res = http.get(`${BASE}/api/auth/qrius/me`, { ...params, tags: { name: "auth_me" } });
      tAuth.add(res.timings.duration);
      check(res, { "auth 200": (r) => r.status === 200 });
    });

    group("navigate", () => {
      const page = PAGES[Math.floor(Math.random() * PAGES.length)];
      const res = http.get(`${BASE}${page}`, { ...params, tags: { name: "navigate" } });
      tNav.add(res.timings.duration);
      check(res, { "page 200": (r) => r.status === 200 });
    });

    tWarmCycle.add(Date.now() - start);
  }

  // Realistic think-time between actions.
  sleep(Math.random() * 3 + 2);
}

export function handleSummary(data) {
  return {
    "summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const g = (n, s) => {
    const v = m[n]?.values?.[s];
    return v === undefined ? "n/a" : Math.round(v * 100) / 100;
  };
  return [
    "",
    `  requests:    ${g("http_reqs", "count")} (${g("http_reqs", "rate")}/s)`,
    `  data_recv:   ${(g("data_received", "rate") * 8 / 1e6).toFixed(1)} Mbps sustained`,
    `  failed:      ${(g("http_req_failed", "rate") * 100).toFixed(2)}%`,
    `  p95:         ${g("http_req_duration", "p(95)")} ms`,
    `  cold p95:    ${g("cold_assets", "p(95)")} ms`,
    `  warm p95:    ${g("warm_cycle", "p(95)")} ms`,
    "",
  ].join("\n");
}
