// Bottleneck-isolation proof. Same 1,000 VU profile as stress-test.js,
// but each iteration fetches ONLY the tiny /api/auth/qrius/me JSON (~70 bytes).
// If this test PASSES while the asset-heavy stress test FAILS at the same VU
// count, the only difference is bytes-on-the-wire → bandwidth is the
// bottleneck, not server/CPU/connections.

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE || "https://mybook.lgacademy.com";
const VUS = Number(__ENV.VUS || 1000);
const RAMP = __ENV.RAMP || "15s";
const HOLD = __ENV.HOLD || "1m";

const cookies = new SharedArray("cookies", () => JSON.parse(open("./cookies.json")));

export const options = {
  discardResponseBodies: true,
  scenarios: {
    api_only: {
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

export default function () {
  const cookie = cookies[__VU % cookies.length];
  const params = { headers: { Cookie: `qrius_session=${cookie}` }, tags: { name: "api_me" } };
  const res = http.get(`${BASE}/api/auth/qrius/me`, params);
  check(res, { "api 200": (r) => r.status === 200 });
  // Same think-time as the stress test so VU pacing is identical — only
  // the bytes-per-iteration differ.
  sleep(Math.random() * 3 + 2);
}

export function handleSummary(data) {
  return { "summary-api-only.json": JSON.stringify(data, null, 2) };
}
