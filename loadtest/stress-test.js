// Browse-flow stress test: authenticated login + homepage + static-asset
// fan-out + auth API + variant page. NO LLM calls.
//
// Env:  BASE, VUS, RAMP, HOLD

import http from "k6/http";
import { check, sleep, group } from "k6";
import { SharedArray } from "k6/data";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE || "https://mybook.lgacademy.com";
const VUS = Number(__ENV.VUS || 100);
const RAMP = __ENV.RAMP || "15s";
const HOLD = __ENV.HOLD || "1m";

const cookies = new SharedArray("cookies", () => JSON.parse(open("./cookies.json")));
const PAGES = ["/", "/deep", "/gem", "/mix", "/claude", "/gem_deep", "/mix_deep"];

const tHome = new Trend("page_home", true);
const tNav = new Trend("page_navigate", true);
const tAuth = new Trend("api_auth_me", true);
const tAssets = new Trend("static_assets", true);

export const options = {
  discardResponseBodies: true,
  scenarios: {
    stress: {
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
  const res = http.get(`${BASE}/`, params);
  const found = res.body ? res.body.match(/\/_next\/static\/[^"']+\.(?:js|css)/g) : null;
  const assets = found ? [...new Set(found)] : [];
  console.log(`setup: status ${res.status}, ${assets.length} static assets`);
  return { assets };
}

export default function (data) {
  const cookie = cookies[__VU % cookies.length];
  const params = { headers: { Cookie: `qrius_session=${cookie}` } };

  group("landing", () => {
    const res = http.get(`${BASE}/`, { ...params, tags: { name: "home" } });
    tHome.add(res.timings.duration);
    check(res, { "home 200": (r) => r.status === 200 });
    if (data.assets.length > 0) {
      const reqs = data.assets.map((path) => ({
        method: "GET",
        url: `${BASE}${path}`,
        params: { ...params, tags: { name: "static" } },
      }));
      const start = Date.now();
      const responses = http.batch(reqs);
      tAssets.add(Date.now() - start);
      check(responses[0], { "asset 200": (r) => r.status === 200 });
    }
  });
  sleep(Math.random() * 2 + 1);

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
    `  requests:  ${g("http_reqs", "count")} (${g("http_reqs", "rate")}/s)`,
    `  failed:    ${(g("http_req_failed", "rate") * 100).toFixed(2)}%`,
    `  p95:       ${g("http_req_duration", "p(95)")} ms`,
    "",
  ].join("\n");
}
