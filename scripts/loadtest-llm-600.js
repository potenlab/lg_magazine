// k6 capacity-curve load test for the LG Magazine production LLM endpoint.
//
//   POST https://mybook.lgacademy.com/api/v3/llm
//   body: { task: "extractKeyword", payload: { answer, rule } }
//   auth: Cookie: qrius_session=<value>   (httpOnly session, ~8h TTL)
//
// Goal: chart the concurrency ceiling of the real AI-Studio 10-code rotation
// pool. We run four SEQUENCED constant-VU scenarios (50 -> 200 -> 400 -> 600),
// each tagged with `stage`, so the summary has a clean per-level curve:
// p95 latency, success rate, and pool-exhaustion count at each concurrency.
//
// Run:
//   QRIUS_COOKIE="<paste qrius_session value>" \
//   k6 run --summary-export docs/loadtest-llm-600-results.json scripts/loadtest-llm-600.js
//
// Env overrides:
//   BASE_URL    default https://mybook.lgacademy.com
//   LLM_MODE    optional x-llm-mode header (gem|claude|mix). Omit = prod default (AI Studio pool).
//   HOLD        seconds to hold each level (default 60)
//   THINK_MIN/THINK_MAX  per-VU think time seconds (default 1..3) — paces quota burn.

import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://mybook.lgacademy.com";
const LLM_MODE = __ENV.LLM_MODE || "";

// Per-VU prod-valid session cookies, minted offline by loadtest/mint-cookies.mjs
// (loadtest-00001..N). One cookie per VU, mirroring the previous test methodology.
const COOKIES = new SharedArray("cookies", () => JSON.parse(open("../loadtest/cookies.json")));
const HOLD = parseInt(__ENV.HOLD || "60", 10);
const THINK_MIN = parseFloat(__ENV.THINK_MIN || "1");
const THINK_MAX = parseFloat(__ENV.THINK_MAX || "3");

// Custom metrics (auto-split by the `stage` tag carried on every request).
const latency = new Trend("llm_latency", true);
const success = new Rate("llm_success");
const poolExhausted = new Counter("llm_pool_exhausted"); // daily-quota phrase ("토큰 호출량")
const upstream500 = new Counter("llm_upstream_500"); // generic AI-Studio 500 under concurrency
const httpFail = new Counter("llm_http_fail"); // any non-200

const ANSWERS = [
  "팀원들이 막막해할 때 제가 흐름을 정리해줬을 때 가장 몰입했어요.",
  "처음 해보는 문제를 파고들면서 구조를 짓는 과정이 즐거웠습니다.",
  "사람들 사이의 관계를 잇고 갈등을 풀어줄 때 보람을 느꼈어요.",
  "데이터를 다루며 패턴을 발견하는 순간 시간 가는 줄 몰랐습니다.",
  "막연한 아이디어를 손에 잡히는 결과로 만들어낼 때 뿌듯했어요.",
];
const RULES = ["flow", "common", "future"];

// Each level is its own constant-VUs scenario, sequenced via startTime, and
// tagged with `stage` so every metric it emits is bucketed by concurrency.
const RAMP = 8; // ramp/settle gap (s) between levels
function level(vus, order) {
  const start = order * (HOLD + RAMP);
  return {
    executor: "constant-vus",
    vus,
    duration: `${HOLD}s`,
    startTime: `${start}s`,
    gracefulStop: "65s", // route maxDuration is 60s
    exec: "hitLLM",
    tags: { stage: String(vus).padStart(3, "0") },
  };
}

export const options = {
  scenarios: {
    s050: level(50, 0),
    s200: level(200, 1),
    s400: level(400, 2),
    s600: level(600, 3),
  },
  thresholds: {
    // Informational — we WANT to see these breached to locate the ceiling.
    "llm_success": ["rate>0.80"],
    "llm_latency": ["p(95)<10000"],
    // Trivially-true thresholds declared per stage tag so k6 emits the tagged
    // sub-metrics into handleSummary — this is what gives us the per-level curve.
    "llm_success{stage:050}": ["rate>=0"],
    "llm_success{stage:200}": ["rate>=0"],
    "llm_success{stage:400}": ["rate>=0"],
    "llm_success{stage:600}": ["rate>=0"],
    "llm_latency{stage:050}": ["p(95)>=0"],
    "llm_latency{stage:200}": ["p(95)>=0"],
    "llm_latency{stage:400}": ["p(95)>=0"],
    "llm_latency{stage:600}": ["p(95)>=0"],
    "llm_upstream_500{stage:050}": ["count>=0"],
    "llm_upstream_500{stage:200}": ["count>=0"],
    "llm_upstream_500{stage:400}": ["count>=0"],
    "llm_upstream_500{stage:600}": ["count>=0"],
  },
  discardResponseBodies: false, // need bodies to detect the quota phrase
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function hitLLM() {
  // Scenario names are s050/s200/s400/s600 — derive the stage label reliably.
  const stage = exec.scenario.name.replace(/^s/, "");
  const cookie = COOKIES[__VU % COOKIES.length];

  const answer = ANSWERS[(__ITER + __VU) % ANSWERS.length];
  const rule = RULES[__VU % RULES.length];

  const headers = {
    "Content-Type": "application/json",
    Cookie: `qrius_session=${cookie}`,
  };
  if (LLM_MODE) headers["x-llm-mode"] = LLM_MODE;

  const body = JSON.stringify({
    task: "extractKeyword",
    payload: { answer, rule },
    sessionId: `loadtest-${stage}-${__VU}`,
  });

  const res = http.post(`${BASE_URL}/api/v3/llm`, body, {
    headers,
    timeout: "65s",
    tags: { stage, endpoint: "v3_llm" },
  });

  latency.add(res.timings.duration, { stage });
  const isOk = res.status === 200;
  success.add(isOk, { stage });

  if (!isOk) {
    httpFail.add(1, { stage });
    const b = typeof res.body === "string" ? res.body : "";
    if (b.includes("토큰 호출량") || b.includes("exhausted") || b.includes("quota")) {
      poolExhausted.add(1, { stage }); // genuine daily-quota cap
    } else if (b.includes("aistudio call") || b.includes("오류가 발생")) {
      upstream500.add(1, { stage }); // generic upstream 500 under concurrency
    }
  }

  check(res, {
    "status 200": (r) => r.status === 200,
    "has result": (r) => typeof r.body === "string" && r.body.includes("result"),
  }, { stage });

  sleep(THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN));
}

// Write a compact, report-friendly JSON next to the raw summary export.
export function handleSummary(data) {
  const stages = ["050", "200", "400", "600"];
  const perStage = {};
  for (const s of stages) {
    const lat = data.metrics.llm_latency ? data.metrics.llm_latency.values : {};
    // k6 sub-metrics by tag appear as `metric{stage:050}` when present.
    const sub = data.metrics[`llm_latency{stage:${s}}`];
    const ok = data.metrics[`llm_success{stage:${s}}`];
    const up = data.metrics[`llm_upstream_500{stage:${s}}`];
    perStage[s] = {
      vus: parseInt(s, 10),
      p95_ms: sub ? sub.values["p(95)"] : null,
      p99_ms: sub ? sub.values["p(99)"] : null,
      med_ms: sub ? sub.values["med"] : null,
      max_ms: sub ? sub.values["max"] : null,
      success_rate: ok ? ok.values.rate : null,
      upstream_500: up ? up.values.count : 0,
    };
  }
  const out = {
    base_url: BASE_URL,
    llm_mode: LLM_MODE || "default(aistudio-pool)",
    task: "extractKeyword",
    hold_seconds: HOLD,
    total_requests: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : null,
    global_p95_ms: data.metrics.llm_latency ? data.metrics.llm_latency.values["p(95)"] : null,
    global_success_rate: data.metrics.llm_success ? data.metrics.llm_success.values.rate : null,
    per_stage: perStage,
  };
  return {
    "docs/loadtest-llm-600-results.json": JSON.stringify(out, null, 2),
    "loadtest/summary-llm-600-raw.json": JSON.stringify(data, null, 2),
    stdout: "\n" + JSON.stringify(out, null, 2) + "\n",
  };
}
