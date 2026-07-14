// ASYNC-aware k6 load test for the LG Magazine LLM endpoint (post-queue deploy).
//
// The server now runs LLM_ASYNC=1: POST /api/v3/llm returns 202 + { jobId }, and
// the client polls GET /api/v3/llm/jobs?id=... until done. So each VU mimics the
// real client: enqueue -> poll -> result. We measure EVENTUAL success and
// time-to-result (enqueue + queue wait + processing), not immediate status — the
// whole point of the queue is to convert failures into waits.
//
//   QRIUS… cookies are pre-minted in loadtest/cookies.json (one per VU → spread
//   across replicas by nginx `hash $cookie_qrius_session consistent`).
//
// Run (600 users, arrive over 60s, each makes one magazine request):
//   k6 run scripts/loadtest-llm-600-async.js
//   VUS=600 ARRIVAL=60 DEADLINE=300 k6 run scripts/loadtest-llm-600-async.js

import http from "k6/http";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://mybook.lgacademy.com";
const VUS = parseInt(__ENV.VUS || "600", 10);
const ARRIVAL_S = parseFloat(__ENV.ARRIVAL || "60"); // window over which all VUs start
const POLL_S = parseFloat(__ENV.POLL || "2");        // seconds between polls
const DEADLINE_S = parseFloat(__ENV.DEADLINE || "300"); // give up waiting after this

const COOKIES = new SharedArray("cookies", () => JSON.parse(open("../loadtest/cookies.json")));

const enqueue202 = new Rate("enqueue_accepted"); // POST returned 202
const gotResult = new Rate("result_success");    // job reached done with a result
const ttr = new Trend("time_to_result_ms", true); // enqueue -> done
const enqMs = new Trend("enqueue_ms", true);     // how fast POST returns
const poll404 = new Counter("poll_404");         // sticky-session miss (wrong replica)
const upstreamErr = new Counter("upstream_error"); // job status=error
const clientTimeout = new Counter("client_timeout"); // exceeded DEADLINE waiting

const ANSWERS = [
  "팀원들이 막막해할 때 제가 흐름을 정리해줬을 때 가장 몰입했어요.",
  "처음 해보는 문제를 파고들면서 구조를 짓는 과정이 즐거웠습니다.",
  "사람들 사이의 관계를 잇고 갈등을 풀어줄 때 보람을 느꼈어요.",
  "데이터를 다루며 패턴을 발견하는 순간 시간 가는 줄 몰랐습니다.",
];

export const options = {
  scenarios: {
    async_600: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1, // each VU = one user making one magazine request
      maxDuration: `${Math.ceil(DEADLINE_S + ARRIVAL_S + 60)}s`,
    },
  },
  thresholds: {
    enqueue_accepted: ["rate>=0"],
    result_success: ["rate>=0"],
  },
  discardResponseBodies: false,
};

export default function () {
  // Spread arrivals across ARRIVAL_S so 600 don't hit the exact same instant.
  sleep((ARRIVAL_S * (__VU - 1)) / VUS);

  const cookie = COOKIES[__VU % COOKIES.length];
  const jsonHeaders = { "Content-Type": "application/json", Cookie: `qrius_session=${cookie}` };
  const getHeaders = { Cookie: `qrius_session=${cookie}` };

  const body = JSON.stringify({
    task: "extractKeyword",
    payload: { answer: ANSWERS[__VU % ANSWERS.length], rule: "flow" },
    sessionId: `async-${__VU}`,
  });

  const t0 = Date.now();
  const post = http.post(`${BASE_URL}/api/v3/llm`, body, { headers: jsonHeaders, timeout: "30s", tags: { step: "enqueue" } });
  enqMs.add(Date.now() - t0);

  const accepted = post.status === 202;
  enqueue202.add(accepted);
  if (!accepted) {
    // Not async, or rejected (429/5xx) — record as no result.
    gotResult.add(false);
    return;
  }

  let jobId;
  try { jobId = post.json("jobId"); } catch (e) { jobId = null; }
  if (!jobId) { gotResult.add(false); return; }

  // Poll until done/error/deadline.
  for (;;) {
    sleep(POLL_S);
    const r = http.get(`${BASE_URL}/api/v3/llm/jobs?id=${jobId}`, { headers: getHeaders, timeout: "30s", tags: { step: "poll" } });
    if (r.status === 404) { poll404.add(1); gotResult.add(false); return; }
    if (r.status === 200) {
      const status = r.json("status");
      if (status === "done") {
        ttr.add(Date.now() - t0);
        gotResult.add(true);
        return;
      }
      if (status === "error") { upstreamErr.add(1); gotResult.add(false); return; }
    }
    if (Date.now() - t0 > DEADLINE_S * 1000) { clientTimeout.add(1); gotResult.add(false); return; }
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (n, s) => (m[n] && m[n].values[s] !== undefined ? m[n].values[s] : null);
  const out = {
    base_url: BASE_URL,
    vus: VUS,
    arrival_window_s: ARRIVAL_S,
    requests_made: v("iterations", "count"),
    enqueue_accepted_rate: v("enqueue_accepted", "rate"),
    result_success_rate: v("result_success", "rate"),
    enqueue_ms_p95: v("enqueue_ms", "p(95)"),
    time_to_result_med_ms: v("time_to_result_ms", "med"),
    time_to_result_p95_ms: v("time_to_result_ms", "p(95)"),
    time_to_result_max_ms: v("time_to_result_ms", "max"),
    poll_404: v("poll_404", "count") || 0,
    upstream_error: v("upstream_error", "count") || 0,
    client_timeout: v("client_timeout", "count") || 0,
  };
  return {
    "docs/loadtest-llm-600-async-results.json": JSON.stringify(out, null, 2),
    "loadtest/summary-llm-600-async-raw.json": JSON.stringify(data, null, 2),
    stdout: "\n" + JSON.stringify(out, null, 2) + "\n",
  };
}
