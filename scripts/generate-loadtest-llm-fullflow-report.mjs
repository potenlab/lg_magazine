// 600 concurrent full-FLOW LLM test report generator — bilingual (KO + EN).
// Reads docs/loadtest-llm-realistic-600-results.json (real k6 data) produced by
// scripts/loadtest-llm-realistic-async.js. Each VU walks one whole magazine
// session: the ordered ~21 LLM tasks across the 4-chapter flow, enqueued through
// the async job queue and polled to completion. Light L-OWL one-liners route to
// the Gemini Flash lane; heavy synthesis/chapter/cover tasks route to Sonnet.
// Writes KO + EN HTML; render to PDF afterwards with headless Chrome.
//
//   node scripts/generate-loadtest-llm-fullflow-report.mjs

import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(
  readFileSync(new URL("../docs/loadtest/results/loadtest-llm-realistic-600-results.json", import.meta.url)),
);

// ── derived numbers ──────────────────────────────────────────────────────────
const pct = (rate) => ((rate ?? 0) * 100).toFixed(1);
const sec = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1));
const min = (ms) => (ms == null ? "—" : (ms / 60000).toFixed(1));

const SESSIONS = R.concurrent_sessions;
const TASKS_PER = R.tasks_per_session;
const HEAVY_PER = R.heavy_calls_per_session;
const LIGHT_PER = TASKS_PER - HEAVY_PER;
const STARTED = R.sessions_started;

const sessOk = pct(R.session_complete_rate);
const taskOk = pct(R.task_success_rate);
const sDurMed = min(R.session_duration_med_ms);
const sDurP95 = min(R.session_duration_p95_ms);
const heavyMed = sec(R.heavy_ttr_med_ms);
const heavyP95 = sec(R.heavy_ttr_p95_ms);
const lightMed = sec(R.light_ttr_med_ms);
const lightP95 = sec(R.light_ttr_p95_ms);
const enqP95 = Math.round(R.enqueue_ms_p95);
const totalReqs = R.total_requests;
const poll404 = R.poll_404 ?? 0;
const upErr = R.upstream_error ?? 0;
const cTimeout = R.client_timeout ?? 0;
const arrivalMin = (R.arrival_window_s / 60).toFixed(0);

const taskRate = R.task_success_rate ?? 0;
const sessRate = R.session_complete_rate ?? 0;

// verdict tier from the per-task success rate (the primary health signal)
const tier = taskRate >= 0.95 ? "good" : taskRate >= 0.8 ? "warn" : "bad";
const okClass = (rate) => (rate >= 0.95 ? "good" : rate >= 0.8 ? "warn" : "bad");

// documented context
const MODEL_LIGHT = "Gemini 2.0 Flash";
const MODEL_HEAVY = "Claude Sonnet 4.5";
const GENERATED = "2026-07-08";
const RUN_LOCAL = "≈18:20 KST (16:20 WIB)";
const SERVER =
  "mybook.lgacademy.com · Next.js · Docker 3 replica · nginx · AI Studio (dual-lane: Flash + Sonnet)";
const GATE_CONC = 5; // AISTUDIO_MAX_CONCURRENCY default (heavy lane)
const REPLICAS = 3;
const EFF_CONC = GATE_CONC * REPLICAS; // ≈15 effective Sonnet ceiling

// ── language strings ─────────────────────────────────────────────────────────
const verdictKR =
  tier === "good"
    ? `현재 구성(비동기 큐 + 듀얼 모델)이 600명 동시 풀세션을 <span class="hi">안정적으로 처리합니다</span>.`
    : tier === "warn"
      ? `현재 구성은 600명 동시 풀세션을 <span class="hi">대부분 처리하나, 일부 작업이 지연·실패</span>합니다.`
      : `600명 동시 풀세션에서는 <span class="hi">큐 포화로 상당수 작업이 실패</span>합니다.`;

const verdictEN =
  tier === "good"
    ? `The current setup (async queue + dual-model) <span class="hi">handles 600 concurrent full sessions reliably</span>.`
    : tier === "warn"
      ? `The current setup handles most of 600 concurrent full sessions, but <span class="hi">some tasks slow down or fail</span>.`
      : `At 600 concurrent full sessions, <span class="hi">queue saturation fails a large share of tasks</span>.`;

const verdictID =
  tier === "good"
    ? `Konfigurasi saat ini (antrean asinkron + dual-model) <span class="hi">menangani 600 sesi penuh bersamaan dengan stabil</span>.`
    : tier === "warn"
      ? `Konfigurasi saat ini menangani sebagian besar dari 600 sesi penuh bersamaan, tetapi <span class="hi">sebagian tugas melambat atau gagal</span>.`
      : `Pada 600 sesi penuh bersamaan, <span class="hi">saturasi antrean menggagalkan sebagian besar tugas</span>.`;

const L = {
  kr: {
    lang: "ko",
    title: "LLM 풀세션 부하 테스트 보고서 — 600명 동시 (전체 플로우)",
    metaTarget: "대상", metaEnv: "환경", metaModel: "모델", metaDate: "작성일",
    metaTool: "도구", metaRun: "실행 시각",
    heroBig: verdictKR,
    heroP: `각 사용자가 한 세션에서 <b>${TASKS_PER}개 LLM 작업</b>(가벼운 한 줄 ${LIGHT_PER}개 → <b>${MODEL_LIGHT}</b>, 무거운 합성·챕터·표지 ${HEAVY_PER}개 → <b>${MODEL_HEAVY}</b>)을 순차 호출합니다. 600명 동시 기준 <b>작업 성공률 ${taskOk}%</b>, <b>세션 완주율 ${sessOk}%</b>. 가벼운 작업 결과 중앙값 <b>${lightMed}초</b>, 무거운 작업 <b>${heavyMed}초</b>.`,
    cardSess: "세션 완주율",
    cardTask: "작업 성공률",
    cardLight: `가벼운 작업 (${MODEL_LIGHT}) 중앙값`,
    cardHeavy: `무거운 작업 (${MODEL_HEAVY}) 중앙값`,
    h1: "1. 결론 요약",
    conclGood: `<b>600명이 동시에 전체 매거진 플로우를 진행해도 작업 성공률 ${taskOk}%, 세션 완주율 ${sessOk}%로 안정적입니다.</b> 가벼운 한 줄 작업을 <b>${MODEL_LIGHT}</b> 라인으로 분리(듀얼 모델)하면서, 병목이던 <b>${MODEL_HEAVY}</b> 라인은 세션당 ${HEAVY_PER}개의 무거운 작업만 담당합니다. 비동기 큐가 순간 폭주를 오류 대신 대기로 흡수해 전 구간 정상이었습니다.`,
    conclWarn: `<b>600명 동시 풀세션에서 작업 성공률 ${taskOk}%, 세션 완주율 ${sessOk}%입니다.</b> 가벼운 작업을 <b>${MODEL_LIGHT}</b> 라인으로 분리해 무거운 <b>${MODEL_HEAVY}</b> 라인 부담을 줄였지만, 세션당 ${HEAVY_PER}개의 무거운 작업이 누적되며 일부는 마감(5분) 내 결과를 받지 못했습니다. 작업 단위 성공은 높고, 세션 완주(21개 전부 성공) 기준이 더 가혹합니다.`,
    conclBad: `<b>600명 동시 풀세션에서는 작업 성공률 ${taskOk}%, 세션 완주율 ${sessOk}%로 부하가 한계를 초과했습니다.</b> 세션당 ${HEAVY_PER}개의 무거운 ${MODEL_HEAVY} 작업 × 600명이 큐를 포화시켜, 상당수 작업이 마감 내 완료되지 못했습니다. 듀얼 모델로 가벼운 작업은 분리됐으나 무거운 라인의 처리량이 병목입니다.`,
    bullets: [
      `<b>듀얼 모델 라우팅:</b> 가벼운 ${LIGHT_PER}개 작업 → ${MODEL_LIGHT}(전용 라인), 무거운 ${HEAVY_PER}개 → ${MODEL_HEAVY}. 병목 라인의 호출 수를 세션당 ${TASKS_PER}→${HEAVY_PER}개로 축소.`,
      `<b>작업 성공률 ${taskOk}%:</b> 600 세션 × ${TASKS_PER}개 = 약 ${(SESSIONS * TASKS_PER).toLocaleString()}개 작업 기준.`,
      `<b>세션 완주율 ${sessOk}%:</b> 한 세션의 ${TASKS_PER}개 작업이 전부 성공해야 완주 — 가장 엄격한 기준.`,
      `<b>결과 지연:</b> 가벼운 작업 중앙값 ${lightMed}초·p95 ${lightP95}초, 무거운 작업 중앙값 ${heavyMed}초·p95 ${heavyP95}초.`,
      `<b>안정성:</b> 폴링 404 ${poll404}건 · 상위 오류 ${upErr}건 · 클라이언트 타임아웃 ${cTimeout}건.`,
    ],
    h2: "2. 테스트 설정",
    setup: [
      ["엔드포인트", "POST /api/v3/llm (접수) · GET /api/v3/llm/jobs (폴링)"],
      ["시나리오", `전체 매거진 플로우 — 세션당 ${TASKS_PER}개 작업 순차 호출`],
      ["듀얼 모델", `가벼운 ${LIGHT_PER}개 → ${MODEL_LIGHT} · 무거운 ${HEAVY_PER}개 → ${MODEL_HEAVY}`],
      ["제공자", "AI Studio 듀얼 레인 (운영 기본값)"],
      ["인증", `오프라인 발급한 운영 유효 세션 쿠키 (loadtest-00001…${String(SESSIONS).padStart(5, "0")})`],
      ["부하 패턴", `${SESSIONS} VU(=동시 세션), ${arrivalMin}분에 걸쳐 도착, 각 VU 1세션`],
      ["측정 방식", "각 작업: 접수(202) → 2초 간격 폴링 → 결과까지 시간(time-to-result)"],
      ["작업당 마감", "300초(5분) 내 미완료 시 실패 처리"],
      ["사전 조건", "운영 큐 백로그 소진 확인 후 깨끗하게 실행"],
    ],
    h3: "3. 측정 결과",
    thMetric: "지표", thVal: "값", thNote: "비고",
    rows: [
      ["시작된 세션", `${STARTED}개`, `${SESSIONS} VU × 1세션`],
      ["세션당 작업 수", `${TASKS_PER}개`, `가벼운 ${LIGHT_PER} + 무거운 ${HEAVY_PER}`],
      ["작업 성공률", `${taskOk}%`, "개별 작업이 결과(done) 도달"],
      ["세션 완주율", `${sessOk}%`, `${TASKS_PER}개 작업 전부 성공`],
      ["총 요청 수", `${totalReqs?.toLocaleString?.() ?? totalReqs}건`, "접수 + 폴링 합계"],
      ["접수 응답 p95", `${enqP95} ms`, "POST 즉시 jobId 반환"],
      [`가벼운 작업 중앙값 (${MODEL_LIGHT})`, `${lightMed} s`, "한 줄 L-OWL 작업"],
      ["가벼운 작업 p95", `${lightP95} s`, ""],
      [`무거운 작업 중앙값 (${MODEL_HEAVY})`, `${heavyMed} s`, "합성·챕터·표지"],
      ["무거운 작업 p95", `${heavyP95} s`, ""],
      ["세션 전체 소요 중앙값", `${sDurMed} 분`, `${TASKS_PER}개 작업 + 생각 시간 포함`],
      ["세션 전체 소요 p95", `${sDurP95} 분`, ""],
      ["폴링 404 (스티키 미스)", `${poll404}건`, "0 = 세션 라우팅 정상"],
      ["상위 오류 (job error)", `${upErr}건`, "AI Studio 처리 오류"],
      ["클라이언트 타임아웃", `${cTimeout}건`, "마감(5분) 초과"],
    ],
    h4: "4. 모델 라인별 비교",
    cmpIntro: `듀얼 모델 라우팅의 효과를 라인별로 비교합니다. 가벼운 작업은 ${MODEL_LIGHT} 전용 라인에서 빠르게 처리되고, 무거운 합성 작업만 ${MODEL_HEAVY} 라인을 거칩니다.`,
    thLane: "모델 라인", thCnt: "세션당 작업", thMedC: "결과 중앙값", thP95C: "결과 p95",
    laneRows: [
      [`${MODEL_LIGHT} (가벼움)`, `${LIGHT_PER}개`, `${lightMed}s`, `${lightP95}s`],
      [`${MODEL_HEAVY} (무거움)`, `${HEAVY_PER}개`, `${heavyMed}s`, `${heavyP95}s`],
    ],
    h5: "5. 해석 — 이 결과의 의미",
    meaningGood: `<b>"600명이 동시에 전체 매거진을 만들어도 견딘다"</b>가 핵심입니다. 직전(듀얼 모델 도입 전) 600 세션 테스트는 큐 포화로 완주하지 못했습니다. 가벼운 작업(세션당 ${LIGHT_PER}개)을 ${MODEL_LIGHT} 전용 라인으로 분리하면서 병목이던 ${MODEL_HEAVY} 라인의 호출이 세션당 ${HEAVY_PER}개로 줄어, 동일 부하에서 처리량이 크게 개선됐습니다.`,
    meaningWarn: `가벼운 작업을 ${MODEL_LIGHT}로 분리한 효과로 직전(듀얼 모델 도입 전)의 전면 포화는 해소됐습니다. 다만 600명 풀세션에서는 세션당 ${HEAVY_PER}개의 ${MODEL_HEAVY} 작업이 누적돼 일부가 마감 내 완료되지 못합니다. 무거운 라인의 처리량(레플리카·게이트)이 다음 병목입니다.`,
    meaningBad: `듀얼 모델로 가벼운 작업은 분리됐지만, 600명 풀세션의 ${MODEL_HEAVY} 무거운 작업 총량(약 ${(SESSIONS * HEAVY_PER).toLocaleString()}개)이 처리량을 초과합니다. 무거운 라인의 동시성 한계(프로세스당 ${GATE_CONC} × ${REPLICAS} 레플리카 ≈ ${EFF_CONC})가 병목입니다.`,
    h6: "6. 권장 사항",
    recsGood: [
      `<b>현 구성 유지:</b> 600명 동시 풀세션까지 안정. 추가 조치 없이 운영 가능.`,
      `<b>진행 표시 UX:</b> 무거운 작업 p95 ${heavyP95}초 동안 "생성 중…" 표시로 대기 체감 완화.`,
      `<b>모니터링:</b> 무거운 라인의 큐 길이와 p95를 운영 지표로 추적.`,
    ],
    recsWarn: [
      `<b>무거운 라인 확장:</b> 레플리카 또는 게이트 값(× 레플리카 ≤ 상위 한계)을 상향해 ${MODEL_HEAVY} 처리량 증대.`,
      `<b>마감 상향 검토:</b> 무거운 작업 p95(${heavyP95}초) 대비 작업당 마감(300초)이 충분한지 점검.`,
      `<b>진행 표시 UX:</b> "생성 중…" 표시로 대기 흡수.`,
    ],
    recsBad: [
      `<b>무거운 라인 처리량 증대 필수:</b> 레플리카 증설 또는 게이트 상향(× 레플리카 ≤ 상위 한계)으로 ${MODEL_HEAVY} 동시성 확대.`,
      `<b>도착 분산:</b> 600명 동시 도착 대신 도착 창을 넓혀 순간 부하 완화.`,
      `<b>무거운 작업 추가 경량화:</b> 일부 합성 작업도 경량 모델/캐시로 이전 검토.`,
    ],
    caveatH: "측정 한계",
    caveat: `전체 매거진 플로우(세션당 ${TASKS_PER}개 작업)를 ${SESSIONS}명이 동시에 진행하는, 가장 무거운 시나리오입니다. 실제 사용자는 작업 사이에 더 긴 읽기·입력 시간이 있어 동시 부하가 분산되므로, 본 테스트는 보수적(최악 근접) 상한입니다. 듀얼 모델 라우팅(가벼움→${MODEL_LIGHT}, 무거움→${MODEL_HEAVY})은 운영 기본값 그대로 적용됐습니다.`,
    foot: `생성일 ${GENERATED} · LG 매거진 LLM 600명 동시 풀세션 테스트 · 듀얼 모델(${MODEL_LIGHT}+${MODEL_HEAVY}) · 데이터: docs/loadtest-llm-realistic-600-results.json (k6, 실측)`,
  },
  en: {
    lang: "en",
    title: "LLM Full-Session Load Test Report — 600 Concurrent Users (Full Flow)",
    metaTarget: "Target", metaEnv: "Environment", metaModel: "Model", metaDate: "Date",
    metaTool: "Tool", metaRun: "Run time",
    heroBig: verdictEN,
    heroP: `Each user runs <b>${TASKS_PER} LLM tasks</b> in one session (${LIGHT_PER} light one-liners → <b>${MODEL_LIGHT}</b>, ${HEAVY_PER} heavy synthesis/chapter/cover tasks → <b>${MODEL_HEAVY}</b>), called in order. At 600 concurrent users: <b>task success ${taskOk}%</b>, <b>session-complete ${sessOk}%</b>. Light tasks median <b>${lightMed}s</b>, heavy tasks <b>${heavyMed}s</b>.`,
    cardSess: "Session-complete rate",
    cardTask: "Task success rate",
    cardLight: `Light task (${MODEL_LIGHT}) median`,
    cardHeavy: `Heavy task (${MODEL_HEAVY}) median`,
    h1: "1. Executive Summary",
    conclGood: `<b>Even with 600 users running the entire magazine flow concurrently, task success is ${taskOk}% and session-complete is ${sessOk}%.</b> By splitting the light one-liner tasks onto the <b>${MODEL_LIGHT}</b> lane (dual-model), the previously bottlenecked <b>${MODEL_HEAVY}</b> lane now handles only ${HEAVY_PER} heavy tasks per session. The async queue absorbs bursts as waiting rather than errors, and production stayed healthy throughout.`,
    conclWarn: `<b>At 600 concurrent full sessions, task success is ${taskOk}% and session-complete is ${sessOk}%.</b> Splitting light tasks onto the <b>${MODEL_LIGHT}</b> lane relieved the heavy <b>${MODEL_HEAVY}</b> lane, but ${HEAVY_PER} heavy tasks per session accumulate and some did not return within the 5-minute deadline. Per-task success is high; session-complete (all ${TASKS_PER} tasks succeeding) is the stricter bar.`,
    conclBad: `<b>At 600 concurrent full sessions, load exceeded capacity: task success ${taskOk}%, session-complete ${sessOk}%.</b> ${HEAVY_PER} heavy ${MODEL_HEAVY} tasks per session × 600 users saturated the queue, so a large share of tasks did not finish within the deadline. Dual-model isolated the light tasks, but the heavy lane's throughput is the bottleneck.`,
    bullets: [
      `<b>Dual-model routing:</b> ${LIGHT_PER} light tasks → ${MODEL_LIGHT} (dedicated lane), ${HEAVY_PER} heavy → ${MODEL_HEAVY}. Cuts the bottleneck lane from ${TASKS_PER} to ${HEAVY_PER} calls per session.`,
      `<b>Task success ${taskOk}%:</b> across 600 sessions × ${TASKS_PER} tasks ≈ ${(SESSIONS * TASKS_PER).toLocaleString()} tasks.`,
      `<b>Session-complete ${sessOk}%:</b> all ${TASKS_PER} tasks in a session must succeed — the strictest measure.`,
      `<b>Result latency:</b> light median ${lightMed}s / p95 ${lightP95}s; heavy median ${heavyMed}s / p95 ${heavyP95}s.`,
      `<b>Stability:</b> ${poll404} polling 404s · ${upErr} upstream errors · ${cTimeout} client timeouts.`,
    ],
    h2: "2. Test Configuration",
    setup: [
      ["Endpoint", "POST /api/v3/llm (enqueue) · GET /api/v3/llm/jobs (poll)"],
      ["Scenario", `Full magazine flow — ${TASKS_PER} tasks per session, called in order`],
      ["Dual-model", `${LIGHT_PER} light → ${MODEL_LIGHT} · ${HEAVY_PER} heavy → ${MODEL_HEAVY}`],
      ["Provider", "AI Studio dual-lane (production default)"],
      ["Auth", `Offline-minted production-valid session cookies (loadtest-00001…${String(SESSIONS).padStart(5, "0")})`],
      ["Load pattern", `${SESSIONS} VUs (= concurrent sessions), arriving over ${arrivalMin} min, 1 session each`],
      ["Measurement", "Per task: enqueue (202) → poll every 2s → time-to-result"],
      ["Per-task deadline", "Fail if not done within 300s (5 min)"],
      ["Precondition", "Production queue backlog confirmed drained before a clean run"],
    ],
    h3: "3. Measured Results",
    thMetric: "Metric", thVal: "Value", thNote: "Note",
    rows: [
      ["Sessions started", `${STARTED}`, `${SESSIONS} VUs × 1 session`],
      ["Tasks per session", `${TASKS_PER}`, `${LIGHT_PER} light + ${HEAVY_PER} heavy`],
      ["Task success rate", `${taskOk}%`, "individual task reached done"],
      ["Session-complete rate", `${sessOk}%`, `all ${TASKS_PER} tasks succeeded`],
      ["Total requests", `${totalReqs?.toLocaleString?.() ?? totalReqs}`, "enqueue + poll"],
      ["Enqueue response p95", `${enqP95} ms`, "POST returns jobId immediately"],
      [`Light median (${MODEL_LIGHT})`, `${lightMed} s`, "one-liner L-OWL tasks"],
      ["Light p95", `${lightP95} s`, ""],
      [`Heavy median (${MODEL_HEAVY})`, `${heavyMed} s`, "synthesis/chapter/cover"],
      ["Heavy p95", `${heavyP95} s`, ""],
      ["Session duration median", `${sDurMed} min`, `${TASKS_PER} tasks + think-time`],
      ["Session duration p95", `${sDurP95} min`, ""],
      ["Polling 404 (sticky miss)", `${poll404}`, "0 = session routing OK"],
      ["Upstream errors (job error)", `${upErr}`, "AI Studio processing errors"],
      ["Client timeouts", `${cTimeout}`, "exceeded 5-min deadline"],
    ],
    h4: "4. Per-Model-Lane Comparison",
    cmpIntro: `Comparing the two lanes shows the effect of dual-model routing: light tasks clear quickly on the ${MODEL_LIGHT} lane, and only the heavy synthesis work goes through the ${MODEL_HEAVY} lane.`,
    thLane: "Model lane", thCnt: "Tasks/session", thMedC: "Result median", thP95C: "Result p95",
    laneRows: [
      [`${MODEL_LIGHT} (light)`, `${LIGHT_PER}`, `${lightMed}s`, `${lightP95}s`],
      [`${MODEL_HEAVY} (heavy)`, `${HEAVY_PER}`, `${heavyMed}s`, `${heavyP95}s`],
    ],
    h5: "5. Interpretation — What This Means",
    meaningGood: `The headline: <b>"600 users can build the entire magazine concurrently and it holds."</b> The previous 600-session test (before dual-model) never completed due to queue saturation. Moving the light tasks (${LIGHT_PER} per session) onto a dedicated ${MODEL_LIGHT} lane cut the bottlenecked ${MODEL_HEAVY} lane to ${HEAVY_PER} calls per session, greatly improving throughput under the same load.`,
    meaningWarn: `Splitting light tasks onto ${MODEL_LIGHT} cleared the full saturation seen before dual-model. But at 600 full sessions the ${HEAVY_PER} ${MODEL_HEAVY} tasks per session accumulate, and some don't finish within the deadline. The heavy lane's throughput (replicas × gate) is the next bottleneck.`,
    meaningBad: `Dual-model isolated the light tasks, but the total ${MODEL_HEAVY} heavy-task volume at 600 full sessions (≈ ${(SESSIONS * HEAVY_PER).toLocaleString()} tasks) exceeds throughput. The heavy lane's concurrency ceiling (${GATE_CONC}/process × ${REPLICAS} replicas ≈ ${EFF_CONC}) is the bottleneck.`,
    h6: "6. Recommendations",
    recsGood: [
      `<b>Keep current config:</b> stable through 600 concurrent full sessions. No action needed to operate.`,
      `<b>Progress UX:</b> show "generating…" during the heavy-task p95 (${heavyP95}s) to ease perceived wait.`,
      `<b>Monitoring:</b> track the heavy lane's queue depth and p95 as operational metrics.`,
    ],
    recsWarn: [
      `<b>Scale the heavy lane:</b> raise replicas or the gate value (× replicas ≤ upstream cap) to increase ${MODEL_HEAVY} throughput.`,
      `<b>Revisit the deadline:</b> check whether the 300s per-task deadline is sufficient vs heavy p95 (${heavyP95}s).`,
      `<b>Progress UX:</b> absorb the wait with a "generating…" indicator.`,
    ],
    recsBad: [
      `<b>Heavy-lane throughput is required:</b> add replicas or raise the gate (× replicas ≤ upstream cap) to widen ${MODEL_HEAVY} concurrency.`,
      `<b>Spread arrivals:</b> widen the arrival window instead of 600 simultaneous starts to soften the burst.`,
      `<b>Further lighten heavy tasks:</b> consider moving some synthesis tasks to a light model/cache.`,
    ],
    caveatH: "Measurement Caveat",
    caveat: `This is the heaviest scenario: ${SESSIONS} users running the full magazine flow (${TASKS_PER} tasks each) concurrently. Real users have longer read/type gaps between tasks that spread the load, so this test is a conservative (near-worst-case) upper bound. Dual-model routing (light → ${MODEL_LIGHT}, heavy → ${MODEL_HEAVY}) was applied exactly as the production default.`,
    foot: `Generated ${GENERATED} · LG Magazine LLM 600-concurrent full-session test · dual-model (${MODEL_LIGHT}+${MODEL_HEAVY}) · data: docs/loadtest-llm-realistic-600-results.json (k6, measured)`,
  },
  id: {
    lang: "id",
    title: "Laporan Uji Beban Sesi Penuh LLM — 600 Pengguna Bersamaan (Alur Lengkap)",
    metaTarget: "Target", metaEnv: "Lingkungan", metaModel: "Model", metaDate: "Tanggal",
    metaTool: "Alat", metaRun: "Waktu eksekusi",
    heroBig: verdictID,
    heroP: `Setiap pengguna menjalankan <b>${TASKS_PER} tugas LLM</b> dalam satu sesi (${LIGHT_PER} tugas ringan satu-baris → <b>${MODEL_LIGHT}</b>, ${HEAVY_PER} tugas berat sintesis/bab/sampul → <b>${MODEL_HEAVY}</b>), dipanggil berurutan. Pada 600 pengguna bersamaan: <b>keberhasilan tugas ${taskOk}%</b>, <b>penyelesaian sesi ${sessOk}%</b>. Median tugas ringan <b>${lightMed}dtk</b>, tugas berat <b>${heavyMed}dtk</b>.`,
    cardSess: "Tingkat penyelesaian sesi",
    cardTask: "Tingkat keberhasilan tugas",
    cardLight: `Median tugas ringan (${MODEL_LIGHT})`,
    cardHeavy: `Median tugas berat (${MODEL_HEAVY})`,
    h1: "1. Ringkasan Eksekutif",
    conclGood: `<b>Bahkan dengan 600 pengguna menjalankan seluruh alur majalah secara bersamaan, keberhasilan tugas ${taskOk}% dan penyelesaian sesi ${sessOk}%.</b> Dengan memisahkan tugas ringan satu-baris ke jalur <b>${MODEL_LIGHT}</b> (dual-model), jalur <b>${MODEL_HEAVY}</b> yang sebelumnya menjadi bottleneck kini hanya menangani ${HEAVY_PER} tugas berat per sesi. Antrean asinkron menyerap lonjakan sebagai antrean, bukan error, dan produksi tetap sehat sepanjang pengujian.`,
    conclWarn: `<b>Pada 600 sesi penuh bersamaan, keberhasilan tugas ${taskOk}% dan penyelesaian sesi ${sessOk}%.</b> Pemisahan tugas ringan ke jalur <b>${MODEL_LIGHT}</b> meringankan jalur berat <b>${MODEL_HEAVY}</b>, tetapi ${HEAVY_PER} tugas berat per sesi terakumulasi dan sebagian tidak selesai dalam tenggat 5 menit. Keberhasilan per-tugas tinggi; penyelesaian sesi (semua ${TASKS_PER} tugas harus berhasil) adalah standar yang lebih ketat.`,
    conclBad: `<b>Pada 600 sesi penuh bersamaan, beban melampaui kapasitas: keberhasilan tugas ${taskOk}%, penyelesaian sesi ${sessOk}%.</b> ${HEAVY_PER} tugas berat ${MODEL_HEAVY} per sesi × 600 pengguna menjenuhkan antrean, sehingga sebagian besar tugas tidak selesai dalam tenggat. Dual-model mengisolasi tugas ringan, tetapi throughput jalur berat adalah bottleneck-nya.`,
    bullets: [
      `<b>Routing dual-model:</b> ${LIGHT_PER} tugas ringan → ${MODEL_LIGHT} (jalur khusus), ${HEAVY_PER} tugas berat → ${MODEL_HEAVY}. Memangkas jalur bottleneck dari ${TASKS_PER} menjadi ${HEAVY_PER} panggilan per sesi.`,
      `<b>Keberhasilan tugas ${taskOk}%:</b> dari 600 sesi × ${TASKS_PER} tugas ≈ ${(SESSIONS * TASKS_PER).toLocaleString()} tugas.`,
      `<b>Penyelesaian sesi ${sessOk}%:</b> semua ${TASKS_PER} tugas dalam satu sesi harus berhasil — ukuran paling ketat.`,
      `<b>Latensi hasil:</b> ringan median ${lightMed}dtk / p95 ${lightP95}dtk; berat median ${heavyMed}dtk / p95 ${heavyP95}dtk.`,
      `<b>Stabilitas:</b> ${poll404} polling 404 · ${upErr} error upstream · ${cTimeout} timeout klien.`,
    ],
    h2: "2. Konfigurasi Pengujian",
    setup: [
      ["Endpoint", "POST /api/v3/llm (enqueue) · GET /api/v3/llm/jobs (polling)"],
      ["Skenario", `Alur majalah lengkap — ${TASKS_PER} tugas per sesi, dipanggil berurutan`],
      ["Dual-model", `${LIGHT_PER} ringan → ${MODEL_LIGHT} · ${HEAVY_PER} berat → ${MODEL_HEAVY}`],
      ["Provider", "AI Studio dual-lane (default produksi)"],
      ["Autentikasi", `Cookie sesi valid-produksi yang diterbitkan offline (loadtest-00001…${String(SESSIONS).padStart(5, "0")})`],
      ["Pola beban", `${SESSIONS} VU (= sesi bersamaan), tiba dalam ${arrivalMin} menit, 1 sesi per VU`],
      ["Pengukuran", "Per tugas: enqueue (202) → polling tiap 2 dtk → time-to-result"],
      ["Tenggat per tugas", "Gagal jika tidak selesai dalam 300 dtk (5 menit)"],
      ["Prasyarat", "Backlog antrean produksi dipastikan kosong sebelum eksekusi bersih"],
    ],
    h3: "3. Hasil Pengukuran",
    thMetric: "Metrik", thVal: "Nilai", thNote: "Catatan",
    rows: [
      ["Sesi dimulai", `${STARTED}`, `${SESSIONS} VU × 1 sesi`],
      ["Tugas per sesi", `${TASKS_PER}`, `${LIGHT_PER} ringan + ${HEAVY_PER} berat`],
      ["Tingkat keberhasilan tugas", `${taskOk}%`, "tugas individual mencapai done"],
      ["Tingkat penyelesaian sesi", `${sessOk}%`, `semua ${TASKS_PER} tugas berhasil`],
      ["Total permintaan", `${totalReqs?.toLocaleString?.() ?? totalReqs}`, "enqueue + polling"],
      ["Respons enqueue p95", `${enqP95} ms`, "POST langsung mengembalikan jobId"],
      [`Median ringan (${MODEL_LIGHT})`, `${lightMed} dtk`, "tugas L-OWL satu-baris"],
      ["Ringan p95", `${lightP95} dtk`, ""],
      [`Median berat (${MODEL_HEAVY})`, `${heavyMed} dtk`, "sintesis/bab/sampul"],
      ["Berat p95", `${heavyP95} dtk`, ""],
      ["Median durasi sesi", `${sDurMed} mnt`, `${TASKS_PER} tugas + waktu berpikir`],
      ["Durasi sesi p95", `${sDurP95} mnt`, ""],
      ["Polling 404 (sticky miss)", `${poll404}`, "0 = routing sesi normal"],
      ["Error upstream (job error)", `${upErr}`, "error pemrosesan AI Studio"],
      ["Timeout klien", `${cTimeout}`, "melampaui tenggat 5 menit"],
    ],
    h4: "4. Perbandingan per Jalur Model",
    cmpIntro: `Perbandingan kedua jalur menunjukkan efek routing dual-model: tugas ringan selesai cepat di jalur ${MODEL_LIGHT}, dan hanya pekerjaan sintesis berat yang melewati jalur ${MODEL_HEAVY}.`,
    thLane: "Jalur model", thCnt: "Tugas/sesi", thMedC: "Median hasil", thP95C: "Hasil p95",
    laneRows: [
      [`${MODEL_LIGHT} (ringan)`, `${LIGHT_PER}`, `${lightMed}dtk`, `${lightP95}dtk`],
      [`${MODEL_HEAVY} (berat)`, `${HEAVY_PER}`, `${heavyMed}dtk`, `${heavyP95}dtk`],
    ],
    h5: "5. Interpretasi — Arti Hasil Ini",
    meaningGood: `Intinya: <b>"600 pengguna dapat membangun seluruh majalah secara bersamaan dan sistem tetap kuat."</b> Uji 600 sesi sebelumnya (sebelum dual-model) tidak pernah selesai karena saturasi antrean. Memindahkan tugas ringan (${LIGHT_PER} per sesi) ke jalur khusus ${MODEL_LIGHT} memangkas jalur ${MODEL_HEAVY} yang menjadi bottleneck menjadi ${HEAVY_PER} panggilan per sesi, meningkatkan throughput secara signifikan pada beban yang sama.`,
    meaningWarn: `Pemisahan tugas ringan ke ${MODEL_LIGHT} menghilangkan saturasi penuh yang terlihat sebelum dual-model. Namun pada 600 sesi penuh, ${HEAVY_PER} tugas ${MODEL_HEAVY} per sesi terakumulasi dan sebagian tidak selesai dalam tenggat. Throughput jalur berat (replika × gate) adalah bottleneck berikutnya.`,
    meaningBad: `Dual-model mengisolasi tugas ringan, tetapi total volume tugas berat ${MODEL_HEAVY} pada 600 sesi penuh (≈ ${(SESSIONS * HEAVY_PER).toLocaleString()} tugas) melampaui throughput. Batas konkurensi jalur berat (${GATE_CONC}/proses × ${REPLICAS} replika ≈ ${EFF_CONC}) adalah bottleneck-nya.`,
    h6: "6. Rekomendasi",
    recsGood: [
      `<b>Pertahankan konfigurasi saat ini:</b> stabil hingga 600 sesi penuh bersamaan. Tidak perlu tindakan tambahan untuk operasional.`,
      `<b>UX indikator progres:</b> tampilkan "sedang membuat…" selama p95 tugas berat (${heavyP95}dtk) untuk mengurangi persepsi menunggu.`,
      `<b>Pemantauan:</b> pantau kedalaman antrean jalur berat dan p95 sebagai metrik operasional.`,
    ],
    recsWarn: [
      `<b>Skalakan jalur berat:</b> naikkan replika atau nilai gate (× replika ≤ batas upstream) untuk menambah throughput ${MODEL_HEAVY}.`,
      `<b>Tinjau ulang tenggat:</b> periksa apakah tenggat 300 dtk per tugas cukup dibandingkan p95 berat (${heavyP95}dtk).`,
      `<b>UX indikator progres:</b> serap waktu tunggu dengan indikator "sedang membuat…".`,
    ],
    recsBad: [
      `<b>Throughput jalur berat wajib dinaikkan:</b> tambah replika atau naikkan gate (× replika ≤ batas upstream) untuk memperluas konkurensi ${MODEL_HEAVY}.`,
      `<b>Sebar kedatangan:</b> perlebar jendela kedatangan alih-alih 600 mulai serentak untuk meredam lonjakan.`,
      `<b>Peringanan tugas berat lebih lanjut:</b> pertimbangkan memindahkan sebagian tugas sintesis ke model ringan/cache.`,
    ],
    caveatH: "Batasan Pengukuran",
    caveat: `Ini adalah skenario terberat: ${SESSIONS} pengguna menjalankan alur majalah lengkap (${TASKS_PER} tugas masing-masing) secara bersamaan. Pengguna nyata memiliki jeda baca/ketik lebih panjang antar tugas yang menyebarkan beban, sehingga uji ini adalah batas atas konservatif (mendekati kasus terburuk). Routing dual-model (ringan → ${MODEL_LIGHT}, berat → ${MODEL_HEAVY}) diterapkan persis seperti default produksi.`,
    foot: `Dibuat ${GENERATED} · Uji sesi penuh 600-bersamaan LLM LG Magazine · dual-model (${MODEL_LIGHT}+${MODEL_HEAVY}) · data: docs/loadtest-llm-realistic-600-results.json (k6, terukur)`,
  },
};

function conclFor(t) {
  return tier === "good" ? t.conclGood : tier === "warn" ? t.conclWarn : t.conclBad;
}
function meaningFor(t) {
  return tier === "good" ? t.meaningGood : tier === "warn" ? t.meaningWarn : t.meaningBad;
}
function recsFor(t) {
  return tier === "good" ? t.recsGood : tier === "warn" ? t.recsWarn : t.recsBad;
}

// ── HTML template ────────────────────────────────────────────────────────────
function render(t) {
  const setupRows = t.setup.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join("\n");
  const bullets = t.bullets.map((b) => `<li>${b}</li>`).join("\n");
  const recs = recsFor(t).map((b) => `<li>${b}</li>`).join("\n");
  const resultRows = t.rows
    .map(([m, v, n]) => `<tr><td>${m}</td><td class="n"><b>${v}</b></td><td>${n}</td></tr>`)
    .join("\n");
  const laneRows = t.laneRows
    .map(([m, c, med, p95]) => `<tr><td>${m}</td><td class="n">${c}</td><td class="n">${med}</td><td class="n">${p95}</td></tr>`)
    .join("\n");
  const heroBg = tier === "good" ? "#052e16" : tier === "warn" ? "#451a03" : "#450a0a";
  const heroHi = tier === "good" ? "#86efac" : tier === "warn" ? "#fcd34d" : "#fca5a5";
  const heroP = tier === "good" ? "#d1fae5" : tier === "warn" ? "#fde68a" : "#fecaca";
  const noteBg = tier === "good" ? "#f0fdf4" : tier === "warn" ? "#fffbeb" : "#fef2f2";
  const noteBd = tier === "good" ? "#22c55e" : tier === "warn" ? "#f59e0b" : "#ef4444";
  const cardV = tier === "good" ? "good" : tier === "warn" ? "warn" : "bad";
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",-apple-system,"Segoe UI",sans-serif; color:#1a1a1a; font-size:12px; line-height:1.6; margin:0; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:14px; margin:20px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
  code { background:#f1f5f9; padding:1px 4px; border-radius:3px; font-size:10.5px; }
  .meta { font-size:10.5px; color:#555; margin-bottom:12px; }
  .meta b { color:#222; }
  .hero { background:${heroBg}; color:#fff; border-radius:10px; padding:16px 18px; margin:12px 0; }
  .hero .big { font-size:18px; font-weight:800; line-height:1.35; }
  .hero .big .hi { color:${heroHi}; }
  .hero p { margin:8px 0 0; font-size:11.5px; color:${heroP}; }
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
  .note { background:${noteBg}; border-left:3px solid ${noteBd}; padding:8px 12px; border-radius:0 6px 6px 0; font-size:11px; margin:8px 0; }
  .note.amber { background:#fffbeb; border-left-color:#f59e0b; }
  ul { margin:6px 0 6px 18px; padding:0; }
  li { margin:4px 0; }
  .foot { margin-top:18px; font-size:9.5px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style></head><body>

<h1>${t.title}</h1>
<div class="meta">
  ${t.metaTarget}: <b>LG Magazine</b> &nbsp;·&nbsp;
  ${t.metaEnv}: <b>${SERVER}</b> &nbsp;·&nbsp;
  ${t.metaModel}: <b>${MODEL_LIGHT} + ${MODEL_HEAVY}</b> &nbsp;·&nbsp;
  ${t.metaTool}: <b>k6</b> &nbsp;·&nbsp;
  ${t.metaRun}: <b>${RUN_LOCAL}</b> &nbsp;·&nbsp;
  ${t.metaDate}: <b>${GENERATED}</b>
</div>

<div class="hero">
  <div class="big">${t.heroBig}</div>
  <p>${t.heroP}</p>
</div>

<div class="cards">
  <div class="card"><div class="v ${cardV}">${sessOk}%</div><div class="l">${t.cardSess}</div></div>
  <div class="card"><div class="v ${cardV}">${taskOk}%</div><div class="l">${t.cardTask}</div></div>
  <div class="card"><div class="v">${lightMed}s</div><div class="l">${t.cardLight}</div></div>
  <div class="card"><div class="v">${heavyMed}s</div><div class="l">${t.cardHeavy}</div></div>
</div>

<h2>${t.h1}</h2>
<div class="note">${conclFor(t)}</div>
<ul>${bullets}</ul>

<h2>${t.h2}</h2>
<table>${setupRows}</table>

<h2>${t.h3}</h2>
<table>
  <tr><th>${t.thMetric}</th><th class="n">${t.thVal}</th><th>${t.thNote}</th></tr>
  ${resultRows}
</table>

<h2>${t.h4}</h2>
<p>${t.cmpIntro}</p>
<table style="margin-top:6px">
  <tr><th>${t.thLane}</th><th class="n">${t.thCnt}</th><th class="n">${t.thMedC}</th><th class="n">${t.thP95C}</th></tr>
  ${laneRows}
</table>

<h2>${t.h5}</h2>
<div class="note">${meaningFor(t)}</div>

<h2>${t.h6}</h2>
<ul>${recs}</ul>

<div class="note amber"><b>${t.caveatH}.</b> ${t.caveat}</div>

<div class="foot">${t.foot}</div>

</body></html>`;
}

for (const [key, t] of Object.entries(L)) {
  const out = new URL(`../docs/loadtest/reports/loadtest_llm_fullflow_600_${key}.html`, import.meta.url);
  writeFileSync(out, render(t));
  console.log("HTML written:", out.pathname);
}
