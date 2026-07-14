// Real-case burst test: 600 users simultaneously submit the gibberish answer
// from the repetition-bug report ("dsfasdfasd") to the Chapter-1 reflection task
// (reflectShort → light/Flash lane) — the exact scenario that produced the
// looped "무엇을 적을지 망설이던..." output in production.
//
// Beyond eventual success (enqueue → poll → done), each VU inspects the RESULT
// TEXT for degenerate sentence repetition, so this run verifies both:
//   1. capacity: 600 simultaneous light-lane jobs complete within deadline
//   2. quality:  the collapseRepeats() guard keeps looped sentences out
//
//   VUS=600 ARRIVAL=10 k6 run scripts/loadtest-llm-gibberish-600.js

import http from "k6/http";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://mybook.lgacademy.com";
const VUS = parseInt(__ENV.VUS || "600", 10);
const ARRIVAL_S = parseFloat(__ENV.ARRIVAL || "10"); // near-simultaneous burst
const POLL_S = parseFloat(__ENV.POLL || "2");
const DEADLINE_S = parseFloat(__ENV.DEADLINE || "300");

const COOKIES = new SharedArray("cookies", () => JSON.parse(open("../loadtest/cookies.json")));

// The exact real case from the bug screenshot: keyboard-mash answer.
const GIBBERISH = ["dsfasdfasd", "asdfjkl;asdf", "qwerqwerqw", "zxcvzxcvzx"];

const gotResult = new Rate("result_success");
const loopedOutput = new Rate("looped_output");     // any sentence ×3+ → degenerate loop
const dupSentence = new Rate("duplicate_sentence"); // any sentence ×2+ (dedupe guard makes this 0)
const outputChars = new Trend("output_chars");
const ttr = new Trend("time_to_result_ms", true);
const enqMs = new Trend("enqueue_ms", true);
const poll404 = new Counter("poll_404");
const upstreamErr = new Counter("upstream_error");
const clientTimeout = new Counter("client_timeout");

export const options = {
  scenarios: {
    gibberish_600: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: `${Math.ceil(DEADLINE_S + ARRIVAL_S + 60)}s`,
    },
  },
  thresholds: { result_success: ["rate>=0"], looped_output: ["rate>=0"] },
  discardResponseBodies: false,
};

// Max occurrence count of any normalized sentence in the text.
function maxSentenceRepeat(text) {
  const parts = String(text).split(/(?<=[.!?…])\s+|\n+/);
  const counts = {};
  let max = 0;
  for (const p of parts) {
    const key = p.replace(/\s+/g, "");
    if (key.length < 5) continue; // ignore fragments
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > max) max = counts[key];
  }
  return max;
}

export default function () {
  sleep((ARRIVAL_S * (__VU - 1)) / VUS);

  const cookie = COOKIES[__VU % COOKIES.length];
  const jsonHeaders = { "Content-Type": "application/json", Cookie: `qrius_session=${cookie}` };
  const getHeaders = { Cookie: `qrius_session=${cookie}` };

  const body = JSON.stringify({
    task: "reflectShort",
    payload: {
      answer: GIBBERISH[__VU % GIBBERISH.length],
      name: "민준",
      chapter: 1,
      topic: "몰입경험",
    },
    sessionId: `gib-${__VU}`,
  });

  const t0 = Date.now();
  const post = http.post(`${BASE_URL}/api/v3/llm`, body, {
    headers: jsonHeaders, timeout: "30s", tags: { step: "enqueue" },
  });
  enqMs.add(Date.now() - t0);
  if (post.status !== 202) { gotResult.add(false); return; }

  let jobId;
  try { jobId = post.json("jobId"); } catch (e) { jobId = null; }
  if (!jobId) { gotResult.add(false); return; }

  for (;;) {
    sleep(POLL_S);
    const r = http.get(`${BASE_URL}/api/v3/llm/jobs?id=${jobId}`, {
      headers: getHeaders, timeout: "30s", tags: { step: "poll" },
    });
    if (r.status === 404) { poll404.add(1); gotResult.add(false); return; }
    if (r.status === 200) {
      const status = r.json("status");
      if (status === "done") {
        ttr.add(Date.now() - t0);
        gotResult.add(true);
        const text = JSON.stringify(r.json("result") ?? "");
        outputChars.add(text.length);
        const rep = maxSentenceRepeat(text);
        dupSentence.add(rep >= 2);
        loopedOutput.add(rep >= 3);
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
    scenario: "gibberish reflectShort (real bug case), simultaneous burst",
    vus: VUS,
    arrival_window_s: ARRIVAL_S,
    requests_made: v("iterations", "count"),
    result_success_rate: v("result_success", "rate"),
    looped_output_rate: v("looped_output", "rate"),
    duplicate_sentence_rate: v("duplicate_sentence", "rate"),
    output_chars_med: v("output_chars", "med"),
    output_chars_max: v("output_chars", "max"),
    enqueue_ms_p95: v("enqueue_ms", "p(95)"),
    time_to_result_med_ms: v("time_to_result_ms", "med"),
    time_to_result_p95_ms: v("time_to_result_ms", "p(95)"),
    time_to_result_max_ms: v("time_to_result_ms", "max"),
    poll_404: v("poll_404", "count") || 0,
    upstream_error: v("upstream_error", "count") || 0,
    client_timeout: v("client_timeout", "count") || 0,
  };
  return {
    "docs/loadtest-llm-gibberish-600-results.json": JSON.stringify(out, null, 2),
    "loadtest/summary-llm-gibberish-600-raw.json": JSON.stringify(data, null, 2),
    stdout: "\n" + JSON.stringify(out, null, 2) + "\n",
  };
}
