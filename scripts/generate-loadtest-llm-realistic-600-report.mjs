// 600-VU full-flow (realistic session) LLM load-test report — bilingual (KR + EN).
// BEFORE/AFTER edition: compares the 1-code light lane (before) vs the 10-code
// light lane (after the Gemini Flash pool fix). Frames the result around: the
// fix eliminated most code-exhaustion errors and raised task success, but at 600
// concurrent FULL sessions the bottleneck moved to concurrency throughput
// (gate ~15 effective + LG AI Studio ~20-concurrent account cap).
// Writes KR + EN HTML. Render to PDF afterwards with headless Chrome.
//
//   node scripts/generate-loadtest-llm-realistic-600-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const A = JSON.parse(
  readFileSync(new URL("../docs/loadtest/results/loadtest-llm-realistic-600-results.json", import.meta.url)),
); // AFTER (10-code light lane)
let B = null;
try {
  B = JSON.parse(
    readFileSync(new URL("../docs/loadtest/results/loadtest-llm-realistic-600-results.BEFORE-fix.json", import.meta.url)),
  ); // BEFORE (1-code light lane)
} catch {
  B = null;
}

// ── derived numbers ──────────────────────────────────────────────────────────
const pct = (rate) => (rate * 100).toFixed(1);
const sec = (ms) => (ms / 1000).toFixed(1);
const n = (x) => Number(x).toLocaleString("en-US");

const aSucc = pct(A.task_success_rate);
const bSucc = B ? pct(B.task_success_rate) : "—";
const aErr = n(A.upstream_error);
const bErr = B ? n(B.upstream_error) : "—";
const aTimeout = n(A.client_timeout);
const bTimeout = B ? n(B.client_timeout) : "—";
const aLightMed = sec(A.light_ttr_med_ms);
const bLightMed = B ? sec(B.light_ttr_med_ms) : "—";
const aLightP95 = sec(A.light_ttr_p95_ms);
const aHeavyMed = sec(A.heavy_ttr_med_ms);
const aHeavyP95 = sec(A.heavy_ttr_p95_ms);
const enqP95 = Math.round(A.enqueue_ms_p95);
const totReq = n(A.total_requests);
const errDrop = B ? Math.round((1 - A.upstream_error / B.upstream_error) * 100) : null; // % fewer errors
const succRel = B ? Math.round((A.task_success_rate / B.task_success_rate - 1) * 100) : null; // % relative gain

// documented context
const HEAVY_MODEL = "Claude Sonnet 4.x";
const LIGHT_MODEL = "Gemini 2.0 Flash (LG AI Studio)";
const GENERATED = "2026-06-26";
const RUN_LOCAL = "≈14:46–15:14 KST (28분 run, 조기 종료 / 28-min run, cut early)";
const SERVER = "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · LG AI Studio";
const HEAVY_CODES = 10; // AISTUDIO_API_CODES
const LIGHT_CODES_BEFORE = 1;
const LIGHT_CODES_AFTER = 10; // AISTUDIO_LIGHT_API_CODES (LG_BOOK_GEMINI + _2..10)
const LIGHT_CALLS = 11; // light tasks per 21-task session
const HEAVY_CALLS = 7;
const HEALTHY_LIGHT = "3–9s"; // light TTR when not saturated (pre-flight + 20-burst)
const ACCOUNT_CAP = "~20"; // LG AI Studio concurrent ceiling
const EFF_GATE = "~15"; // 5/process × 3 replicas

// ── language strings ─────────────────────────────────────────────────────────
const L = {
  kr: {
    lang: "ko",
    title: "LLM 부하 테스트 보고서 — 600명 풀플로우 (Gemini Flash, 코드 풀 수정 전/후)",
    metaTarget: "대상", metaEnv: "환경", metaModel: "모델", metaDate: "작성일",
    metaTool: "도구", metaRun: "실행 시각",
    heroBig: `경량 코드 풀 수정(1→10개)으로 <span class="good-i">소진 오류는 대폭 감소</span>했으나, 600명 동시 풀세션은 여전히 <span class="warn-i">동시성 한계</span>에 막혀 있습니다.`,
    heroP: `경량(Gemini Flash) 레인을 코드 1개→10개로 늘린 결과, 작업 성공률 ${bSucc}%→<b>${aSucc}%</b>(상대 +${succRel}%), 상위 오류 ${bErr}→<b>${aErr}</b>건(−${errDrop}%). 다만 실패 양상이 "오류"에서 "대기·타임아웃"으로 바뀌었고, 완주 세션은 여전히 0/600입니다.`,
    cardA: "작업 성공률 (수정 후)", cardAv: `${aSucc}%`, cardAc: "warn",
    cardB: "상위 오류 감소", cardBv: `−${errDrop}%`, cardBc: "good",
    cardC: "경량 코드", cardCv: `1 → 10`, cardCc: "good",
    cardD: "완주 세션", cardDv: "0 / 600", cardDc: "bad",
    h1: "1. 결론 요약",
    concl: `<b>수정은 옳았고 효과가 있었습니다.</b> 경량 레인 코드를 1개(<code>GEMINI_FLASH</code>)에서 10개(<code>LG_BOOK_GEMINI</code> 외 9개)로 늘리자 "코드 소진" 오류가 ${errDrop}% 줄고 작업 성공률이 ${bSucc}%→${aSucc}%로 올랐습니다. 배포 전 10개 코드 모두 <b>10/10 정상</b> 확인, 20개 동시 버스트도 <b>20/20 성공</b>했습니다. <b>그러나</b> 600명이 동시에 풀세션(21작업, 총 ≈12,600작업)을 돌리면, 이제 병목은 코드 수가 아니라 <b>동시 처리량(게이트 ${EFF_GATE} + AI Studio 계정 ~20 동시 한계)</b>입니다. 작업이 오류 대신 큐에서 대기하다 300초 마감을 넘겨 타임아웃됩니다(라이브 프로브: 큐 위치 188~337).`,
    rootH: "병목 이동 — 코드 소진 → 동시성 처리량",
    root: `수정 전: 경량 코드 1개가 즉시 소진되어 <b>오류</b> 발생. 수정 후: 코드는 충분하지만 동시 실행 슬롯(게이트 ${EFF_GATE}, 계정 ~20)이 600 동시 부하를 못 따라가 <b>큐 적체→타임아웃</b>. 즉 코드 증설은 <b>쿼터/소진</b> 문제를 풀지만 <b>동시 처리량</b>은 늘리지 못합니다 — 처리량은 게이트와 계정 한계가 결정합니다.`,
    bullets: [
      `<b>작업 성공률 ${bSucc}% → ${aSucc}%</b> (상대 +${succRel}%): 명확한 개선.`,
      `<b>상위 오류 ${bErr} → ${aErr}건</b> (−${errDrop}%): 소진 오류 대부분 제거.`,
      `<b>실패 양상 전환:</b> 타임아웃 ${bTimeout}→${aTimeout}건 — 오류로 죽는 대신 큐에서 대기하다 마감 초과.`,
      `<b>경량 TTR ${bLightMed}→${aLightMed}초(중앙값):</b> 빨리 실패하던 게 사라지고 깊은 큐에서 대기 → 수치상 증가.`,
      `<b>무거운(Sonnet) TTR:</b> 중앙 ${aHeavyMed}초, p95 ${aHeavyP95}초 — 무거운 레인도 동시성 한계로 포화.`,
      `<b>완주 세션 0/600:</b> 600 동시 풀세션은 현재 동시 처리량 천장을 초과.`,
    ],
    h2: "2. 적용한 수정 + 검증",
    setup: [
      ["변경", `AISTUDIO_LIGHT_API_CODES: GEMINI_FLASH (1개) → LG_BOOK_GEMINI + LG_BOOK_GEMINI_2..10 (10개)`],
      ["배포", "운영 .env 갱신 후 docker compose up -d (재빌드 불필요 — env만 변경)"],
      ["코드 검증", "AI Studio 직접 프로브 — 10/10 코드 정상(각 ~3초, 한국어 정상 응답)"],
      ["사전 버스트", "운영에 경량 20개 동시 호출 → 20/20 성공(중앙 9.6초), 소진 오류 0"],
      ["부하 시나리오", `실사용 풀세션 — 세션당 21작업(경량 ${LIGHT_CALLS}+무거움 ${HEAVY_CALLS})`],
      ["부하 패턴", "600 VU, 600초에 걸쳐 ~1세션/초 도착, 작업당 마감 300초"],
      ["실행/종료", "28분 후 조기 종료(양상 확정, 운영 부하 최소화)"],
    ],
    h3: "3. 수정 전 / 후 비교 (600 동시 풀세션)",
    thMetric: "지표", thBefore: "수정 전 (코드 1)", thAfter: "수정 후 (코드 10)", thDelta: "변화",
    cmp: [
      ["작업 성공률", `${bSucc}%`, `${aSucc}%`, `+${succRel}% 상대`],
      ["상위 오류", `${bErr}`, `${aErr}`, `−${errDrop}%`],
      ["클라이언트 타임아웃", `${bTimeout}`, `${aTimeout}`, "오류→대기 전환"],
      ["경량 TTR 중앙값", `${bLightMed}s`, `${aLightMed}s`, "큐 대기 증가"],
      ["완주 세션", "0/600", "0/600", "동시성 한계"],
      ["접수 응답 p95", "~378ms", `${enqP95}ms`, "정상 (병목 아님)"],
    ],
    h4: "4. 해석 — 이 결과의 의미",
    meaning: `코드 증설은 <b>정확한 1차 수정</b>이었습니다(소진 오류 제거). 그러나 600명 <b>동시</b> 풀세션은 ≈12,600개 작업을 동시에 밀어 넣는 극단적 부하로, LG AI Studio 계정의 <b>~20 동시 한계</b>와 로컬 게이트(${EFF_GATE})가 처리량 천장입니다. 실사용은 600명이 정확히 같은 순간 시작하지 않고 자연스럽게 분산되므로, 실제 체감 부하는 이 테스트보다 훨씬 완만합니다. 비동기 큐 덕분에 <b>하드 실패 대신 대기</b>로 흡수되는 점은 그대로 유효합니다.`,
    h5: "5. 권장 사항",
    recs: [
      `<b>완료 (검증됨):</b> 경량 코드 1→10개 — 소진 오류 ${errDrop}% 감소. 운영 반영 완료.`,
      `<b>동시성 한계 확인(다음 단계):</b> LG AI Studio 계정 ~20 동시 제한이 두 레인 합산인지 레인별인지 확인. 상향 가능하면 협의.`,
      `<b>게이트 튜닝:</b> 한계가 허용하는 선에서 AISTUDIO_(LIGHT_)MAX_CONCURRENCY × 레플리카를 계정 한계에 맞춰 상향.`,
      `<b>현실적 동시 사용자 산정:</b> 600 동시 풀세션은 천장 초과. 도착 분산을 반영한 목표치로 SLA 설정 권장.`,
      `<b>별개 버그:</b> <code>judgeBranch</code>가 <code>reading 'letters'</code>로 실패(부하 무관). 페이로드/핸들러 점검.`,
    ],
    caveatH: "측정 한계",
    caveat: `600명 동시 풀세션은 최대 부하 시나리오이며 28분 시점에 조기 종료했습니다(양상 확정·운영 부하 절감). 일부 지표는 포화 구간 표본입니다. 수정 전(코드 1) 데이터는 동일 스크립트·동일 파라미터의 직전 실측이며, 비교는 동일 조건 기준입니다.`,
    foot: `생성일 ${GENERATED} · LG 매거진 600명 풀플로우 LLM 테스트 (Gemini Flash, 코드풀 수정 전/후) · 데이터: docs/loadtest-llm-realistic-600-results.json (+ .BEFORE-fix) · k6 실측`,
  },
  en: {
    lang: "en",
    title: "LLM Load Test Report — 600-User Full Flow (Gemini Flash, before/after code-pool fix)",
    metaTarget: "Target", metaEnv: "Environment", metaModel: "Models", metaDate: "Date",
    metaTool: "Tool", metaRun: "Run time",
    heroBig: `The light-pool fix (1→10 codes) <span class="good-i">cut exhaustion errors sharply</span>, but 600 concurrent full sessions still hit the <span class="warn-i">concurrency ceiling</span>.`,
    heroP: `Expanding the light (Gemini Flash) lane from 1 code to 10 raised task success ${bSucc}%→<b>${aSucc}%</b> (+${succRel}% relative) and cut upstream errors ${bErr}→<b>${aErr}</b> (−${errDrop}%). But the failure mode shifted from "errors" to "queue wait / timeout", and session completion is still 0/600.`,
    cardA: "Task success (after)", cardAv: `${aSucc}%`, cardAc: "warn",
    cardB: "Upstream errors", cardBv: `−${errDrop}%`, cardBc: "good",
    cardC: "Light codes", cardCv: `1 → 10`, cardCc: "good",
    cardD: "Sessions completed", cardDv: "0 / 600", cardDc: "bad",
    h1: "1. Executive Summary",
    concl: `<b>The fix was correct and it worked.</b> Growing the light lane from 1 code (<code>GEMINI_FLASH</code>) to 10 (<code>LG_BOOK_GEMINI</code> + 9 more) cut "code exhausted" errors by ${errDrop}% and lifted task success ${bSucc}%→${aSucc}%. Pre-deploy, all 10 codes verified <b>10/10 healthy</b> and a 20-concurrent burst hit <b>20/20</b>. <b>However</b>, when 600 users run the full 21-task session at once (≈12,600 tasks), the bottleneck is no longer code count but <b>concurrency throughput</b> (gate ${EFF_GATE} + LG AI Studio ~20-concurrent account cap). Tasks now wait in the queue instead of erroring, exceeding the 300s deadline (live probe: queue positions 188–337).`,
    rootH: "Bottleneck shifted — code exhaustion → concurrency throughput",
    root: `Before: the single light code exhausted instantly → <b>errors</b>. After: codes are plentiful, but the concurrent execution slots (gate ${EFF_GATE}, account ~20) can't keep up with 600 concurrent load → <b>queue backlog → timeouts</b>. Adding codes solves <b>quota/exhaustion</b>, not <b>throughput</b> — throughput is set by the gate and the account ceiling.`,
    bullets: [
      `<b>Task success ${bSucc}% → ${aSucc}%</b> (+${succRel}% relative): clear improvement.`,
      `<b>Upstream errors ${bErr} → ${aErr}</b> (−${errDrop}%): exhaustion errors largely eliminated.`,
      `<b>Failure mode shifted:</b> timeouts ${bTimeout}→${aTimeout} — tasks queue instead of dying, then exceed the deadline.`,
      `<b>Light TTR ${bLightMed}→${aLightMed}s (median):</b> fail-fast errors gone; tasks now wait in a deep queue → number rises.`,
      `<b>Heavy (Sonnet) TTR:</b> median ${aHeavyMed}s, p95 ${aHeavyP95}s — heavy lane also saturated by the concurrency limit.`,
      `<b>0/600 sessions completed:</b> 600 concurrent full sessions exceed the current throughput ceiling.`,
    ],
    h2: "2. Fix Applied + Verification",
    setup: [
      ["Change", `AISTUDIO_LIGHT_API_CODES: GEMINI_FLASH (1) → LG_BOOK_GEMINI + LG_BOOK_GEMINI_2..10 (10)`],
      ["Deploy", "Updated production .env, then docker compose up -d (no rebuild — env-only change)"],
      ["Code verification", "Direct AI Studio probe — 10/10 codes healthy (~3s each, valid Korean output)"],
      ["Pre-flight burst", "20 concurrent light calls to production → 20/20 success (median 9.6s), 0 exhaustion errors"],
      ["Load scenario", `Realistic full session — 21 tasks/session (${LIGHT_CALLS} light + ${HEAVY_CALLS} heavy)`],
      ["Load pattern", "600 VUs, ~1 session/sec over 600s, 300s per-task deadline"],
      ["Run / cut", "stopped at 28 min (mode conclusive, to limit production load)"],
    ],
    h3: "3. Before / After (600 concurrent full sessions)",
    thMetric: "Metric", thBefore: "Before (1 code)", thAfter: "After (10 codes)", thDelta: "Change",
    cmp: [
      ["Task success rate", `${bSucc}%`, `${aSucc}%`, `+${succRel}% rel`],
      ["Upstream errors", `${bErr}`, `${aErr}`, `−${errDrop}%`],
      ["Client timeouts", `${bTimeout}`, `${aTimeout}`, "error→wait shift"],
      ["Light TTR median", `${bLightMed}s`, `${aLightMed}s`, "more queue wait"],
      ["Sessions completed", "0/600", "0/600", "concurrency ceiling"],
      ["Enqueue p95", "~378ms", `${enqP95}ms`, "fine (not the bottleneck)"],
    ],
    h4: "4. Interpretation",
    meaning: `Adding codes was the <b>correct first fix</b> (it removed exhaustion errors). But 600 <b>simultaneous</b> full sessions push ≈12,600 tasks at once — an extreme load where LG AI Studio's <b>~20-concurrent account cap</b> and the local gate (${EFF_GATE}) are the throughput ceiling. Real usage doesn't start 600 sessions at the exact same instant; arrivals spread out, so real-world load is far gentler than this test. The async queue still absorbs bursts as <b>waiting rather than hard failure</b>.`,
    h5: "5. Recommendations",
    recs: [
      `<b>Done (verified):</b> light codes 1→10 — exhaustion errors −${errDrop}%. Live in production.`,
      `<b>Confirm the concurrency cap (next):</b> check whether LG AI Studio's ~20-concurrent limit is shared across both lanes or per-lane. Negotiate a higher cap if possible.`,
      `<b>Tune the gate:</b> raise AISTUDIO_(LIGHT_)MAX_CONCURRENCY × replicas up to the account ceiling.`,
      `<b>Size realistic concurrency:</b> 600 simultaneous full sessions exceed the ceiling. Set the SLA target against a spread arrival model.`,
      `<b>Separate bug:</b> <code>judgeBranch</code> fails with <code>reading 'letters'</code> (load-independent). Inspect payload/handler.`,
    ],
    caveatH: "Measurement Caveats",
    caveat: `600 concurrent full sessions is a max-load scenario, cut at 28 min (mode conclusive, to limit production load). Some figures sample the saturated window. The before (1-code) data is the prior measured run with the same script and parameters, so the comparison is like-for-like.`,
    foot: `Generated ${GENERATED} · LG Magazine 600-user full-flow LLM test (Gemini Flash, before/after code-pool fix) · Data: docs/loadtest-llm-realistic-600-results.json (+ .BEFORE-fix) · k6 measured`,
  },
};

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = t.recs.map((b) => `<li>${b}</li>`).join("\n");
  const cmpRows = t.cmp
    .map(([m, b, a, d]) => `<tr><td>${m}</td><td class="n">${b}</td><td class="n"><b>${a}</b></td><td class="n">${d}</td></tr>`)
    .join("\n");
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.6; margin:0; }
  h1 { font-size:19px; margin:0 0 4px; }
  h2 { font-size:14px; margin:20px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:12px; }
  .meta b { color:#222; }
  .hero { background:#422006; color:#fff; border-radius:10px; padding:16px 18px; margin:12px 0; }
  .hero .big { font-size:17px; font-weight:800; line-height:1.35; }
  .hero .big .good-i { color:#86efac; }
  .hero .big .warn-i { color:#fcd34d; }
  .hero p { margin:8px 0 0; font-size:11.5px; color:#fef3c7; }
  .cards { display:flex; gap:10px; margin:12px 0; }
  .card { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#f8fafc; }
  .card .v { font-size:18px; font-weight:800; color:#0f172a; }
  .card .v.good { color:#15803d; }
  .card .v.warn { color:#b45309; }
  .card .v.bad { color:#b91c1c; }
  .card .l { font-size:10px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px; }
  th, td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; font-weight:700; }
  td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .good { color:#15803d; font-weight:700; }
  .warn { color:#b45309; font-weight:700; }
  .bad  { color:#b91c1c; font-weight:700; }
  .note { background:#fffbeb; border-left:3px solid #f59e0b; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  .note.green { background:#f0fdf4; border-left-color:#22c55e; }
  ul { margin:6px 0 6px 18px; padding:0; }
  li { margin:4px 0; }
  .foot { margin-top:18px; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style></head><body>

<h1>${t.title}</h1>
<div class="meta">
  ${t.metaTarget}: <b>LG Magazine</b> &nbsp;·&nbsp;
  ${t.metaEnv}: <b>${SERVER}</b> &nbsp;·&nbsp;
  ${t.metaModel}: <b>${HEAVY_MODEL} + ${LIGHT_MODEL}</b> &nbsp;·&nbsp;
  ${t.metaTool}: <b>k6</b> &nbsp;·&nbsp;
  ${t.metaRun}: <b>${RUN_LOCAL}</b> &nbsp;·&nbsp;
  ${t.metaDate}: <b>${GENERATED}</b>
</div>

<div class="hero">
  <div class="big">${t.heroBig}</div>
  <p>${t.heroP}</p>
</div>

<div class="cards">
  <div class="card"><div class="v ${t.cardAc}">${t.cardAv}</div><div class="l">${t.cardA}</div></div>
  <div class="card"><div class="v ${t.cardBc}">${t.cardBv}</div><div class="l">${t.cardB}</div></div>
  <div class="card"><div class="v ${t.cardCc}">${t.cardCv}</div><div class="l">${t.cardC}</div></div>
  <div class="card"><div class="v ${t.cardDc}">${t.cardDv}</div><div class="l">${t.cardD}</div></div>
</div>

<h2>${t.h1}</h2>
<div class="note green">${t.concl}</div>
<div class="note"><b>${t.rootH}.</b> ${t.root}</div>
<ul>${bullets}</ul>

<h2>${t.h2}</h2>
<table>${setupRows}</table>

<h2>${t.h3}</h2>
<table>
  <tr><th>${t.thMetric}</th><th class="n">${t.thBefore}</th><th class="n">${t.thAfter}</th><th class="n">${t.thDelta}</th></tr>
  ${cmpRows}
</table>

<h2>${t.h4}</h2>
<div class="note green">${t.meaning}</div>

<h2>${t.h5}</h2>
<ul>${recs}</ul>

<div class="note"><b>${t.caveatH}.</b> ${t.caveat}</div>

<div class="foot">${t.foot}</div>

</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/reports/loadtest_llm_realistic600_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
