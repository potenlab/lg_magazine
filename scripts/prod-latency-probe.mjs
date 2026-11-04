#!/usr/bin/env node
// Low-impact production latency probe: answers "which layer is slow?" without
// adding meaningful load, so it is safe to run while users are on the site.
//
//   node scripts/prod-latency-probe.mjs
//   ROUNDS=60 GAP_MS=10000 OUT=/tmp/probe.json node scripts/prod-latency-probe.mjs
//
// Safety by design:
//   - strictly sequential: one request in flight at a time, roughly 1 req/s
//   - GAP_MS has a floor of 1s, so it cannot be turned into a load test
//   - sends no cookies and never calls /api/v3/llm, so it spends no AI Studio
//     tokens and writes nothing to the database
//
// What it cannot see: anything behind login (page HTML, session saves, MSSQL,
// LLM queue). Unauthenticated requests stop at the proxy gate. For those layers
// use scripts/vm-slowness-diagnostics.sh on the VM.
//
// How to read it:
//   server    time after the network: wait after TLS, minus that host's median
//             RTT. Using the median matters: a connect delayed by a dropped SYN
//             must not be subtracted, or it hides server time.
//   slow conn TCP connects at least 500ms over that host's median. Stalls of
//             almost exactly +1s/+2s/+3s are SYN retransmits, i.e. connection
//             attempts being dropped before the app sees them.
//   control   other sites sampled in the same window. If they stall too, the
//             problem is the network this script is running on. Clean controls
//             only rule out that network: nearby CDN hosts take a different
//             route, so they say nothing about the path to production.
//
// Exits 1 if any budget is exceeded.

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.BASE || "https://mybook.lgacademy.com";
const ROUNDS = Number(process.env.ROUNDS || 20);
const GAP_MS = Math.max(1_000, Number(process.env.GAP_MS || 3_000));
const REQUEST_GAP_MS = 250;
const OUT = process.env.OUT;
const SLOW_CONNECT_MARGIN_MS = 500;
const MAX_SLOW_CONNECT_PCT = 5;
const KEEPALIVE_REQUESTS = 30;

// budgetMs is the largest acceptable p95 of server time.
const TARGETS = [
  { name: "nginx: static svg", url: `${BASE}/brand/magazine-story-logo.svg`, expect: 200, budgetMs: 200 },
  { name: "nginx: static jpg", url: `${BASE}/vision_express/common/table.jpg`, expect: 200, budgetMs: 200 },
  { name: "node: auth gate (/)", url: `${BASE}/`, expect: 307, budgetMs: 300 },
  { name: "node: api (/me)", url: `${BASE}/api/auth/qrius/me`, expect: 401, budgetMs: 300 },
  {
    name: "node: image optimizer",
    url: `${BASE}/_next/image?url=%2Fvision_express%2Fv3%2Fowl%2Fl-owl-02.png&w=2048&q=75`,
    expect: 200,
    budgetMs: 2_000,
    headers: ["Accept: image/webp,image/png,*/*"],
  },
];

const CONTROLS = [
  { name: "control: google", url: "https://www.google.com/generate_204", control: true },
  { name: "control: naver (KR)", url: "https://www.naver.com/favicon.ico", control: true },
  { name: "control: github", url: "https://github.com/favicon.ico", control: true },
];

const ALL = [...TARGETS, ...CONTROLS];
const KEEPALIVE_URL = `${BASE}/api/auth/qrius/me`;
const DOWNLOAD_URL = `${BASE}/vision_express/kokoreli777-inside-old-train-169418.mp3`;
const CONTROL_DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes=1500000";
const DOWNLOADS = 3;

const WRITE_OUT = [
  "%{http_code}",
  "%{http_version}",
  "%{time_namelookup}",
  "%{time_connect}",
  "%{time_appconnect}",
  "%{time_starttransfer}",
  "%{time_total}",
  "%{speed_download}",
  "%{size_download}",
  "%{num_connects}",
].join("\t");

function parseTimings(line) {
  const [code, version, dns, connect, tls, ttfb, total, speed, size, conns] = line.split("\t");
  return {
    status: Number(code),
    version,
    dnsMs: Number(dns) * 1000,
    connectMs: (Number(connect) - Number(dns)) * 1000,
    tlsMs: Math.max(0, Number(tls) - Number(connect)) * 1000,
    waitMs: Math.max(0, Number(ttfb) - Math.max(Number(tls), Number(connect))) * 1000,
    totalMs: Number(total) * 1000,
    mbps: (Number(speed) * 8) / 1e6,
    bytes: Number(size),
    newConnections: Number(conns),
  };
}

async function sample(url, headers = []) {
  const args = ["-s", "-o", "/dev/null", "--max-time", "30", "-w", WRITE_OUT];
  for (const h of headers) args.push("-H", h);
  args.push(url);

  const at = new Date().toISOString();
  try {
    const { stdout } = await exec("curl", args);
    return { at, ...parseTimings(stdout) };
  } catch (err) {
    return { at, status: 0, error: err.stderr || err.message };
  }
}

// One curl process with many URLs reuses a single connection, which shows
// whether stalls affect only new connections or established ones as well.
async function keepAliveRun() {
  const args = ["-s", "--max-time", "60", "--rate", "2/s", "-w", `${WRITE_OUT}\n`];
  for (let i = 0; i < KEEPALIVE_REQUESTS; i++) args.push("-o", "/dev/null", KEEPALIVE_URL);
  try {
    const { stdout } = await exec("curl", args);
    return stdout.trim().split("\n").map(parseTimings);
  } catch (err) {
    console.log(`Keep-alive check skipped: ${err.message.split("\n")[0]}`);
    return [];
  }
}

// Nearest-rank, which stays honest on small samples: p95 of 20 is the 19th value.
function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarize(target, samples) {
  const answered = samples.filter((s) => s.status > 0);
  const ok = target.control ? answered : samples.filter((s) => s.status === target.expect);
  const failed = samples.length - ok.length;
  const baseRtt = percentile(answered.map((s) => s.connectMs), 50);
  const server = ok.map((s) => Math.max(0, s.waitMs - baseRtt));
  const total = ok.map((s) => s.totalMs);
  const slowConnects = answered.filter((s) => s.connectMs >= baseRtt + SLOW_CONNECT_MARGIN_MS).length;
  const slowPct = answered.length ? (slowConnects / answered.length) * 100 : NaN;
  const serverP95 = percentile(server, 95);

  const overBudget = !target.control && !(serverP95 <= target.budgetMs);
  const tooManySlow = !target.control && slowPct > MAX_SLOW_CONNECT_PCT;
  return {
    name: target.name,
    n: samples.length,
    failed,
    statuses: [...new Set(samples.map((s) => s.status))].join(","),
    rtt: baseRtt,
    slowConnects,
    slowPct,
    serverP50: percentile(server, 50),
    serverP95,
    serverMax: Math.max(...server),
    totalP50: percentile(total, 50),
    totalP95: percentile(total, 95),
    totalMax: Math.max(...total),
    verdict: target.control ? "control" : failed > 0 || overBudget || tooManySlow ? "FAIL" : "pass",
  };
}

const ms = (v) => (Number.isFinite(v) ? `${Math.round(v)}` : "-");

function printTable(rows) {
  const head = ["target", "n", "bad", "status", "rtt", "slow conn", "srv p50", "srv p95", "tot p50", "tot p95", "tot max", ""];
  const body = rows.map((r) => [
    r.name,
    r.n,
    r.failed,
    r.statuses,
    ms(r.rtt),
    `${r.slowConnects} (${ms(r.slowPct)}%)`,
    ms(r.serverP50),
    ms(r.serverP95),
    ms(r.totalP50),
    ms(r.totalP95),
    ms(r.totalMax),
    r.verdict,
  ]);
  const all = [head, ...body].map((row) => row.map(String));
  const widths = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  for (const row of all) {
    console.log(row.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  "));
  }
}

const samples = new Map(ALL.map((t) => [t.name, []]));
console.log(`Probing ${BASE}: ${ROUNDS} rounds, ${GAP_MS}ms apart, sequential.`);

for (let round = 0; round < ROUNDS; round++) {
  for (const target of ALL) {
    samples.get(target.name).push(await sample(target.url, target.headers));
    await sleep(REQUEST_GAP_MS);
  }
  if (round < ROUNDS - 1) await sleep(GAP_MS);
}

const keepAlive = await keepAliveRun();

const downloads = [];
const controlDownloads = [];
for (let i = 0; i < DOWNLOADS; i++) {
  downloads.push(await sample(DOWNLOAD_URL));
  await sleep(GAP_MS);
  controlDownloads.push(await sample(CONTROL_DOWNLOAD_URL));
  await sleep(GAP_MS);
}

const rows = ALL.map((t) => summarize(t, samples.get(t.name)));
const versions = [...new Set(TARGETS.flatMap((t) => samples.get(t.name).map((s) => s.version)))].join(",");

console.log(`\nAll times in ms. HTTP version from production: ${versions}.\n`);
printTable(rows);

if (keepAlive.length > 0) {
  const waits = keepAlive.map((s) => s.waitMs);
  const newConnections = keepAlive.reduce((sum, s) => sum + s.newConnections, 0);
  console.log(
    `\nReused connection: ${keepAlive.length} requests over ${newConnections} new connection(s), ` +
      `time to first byte p50 ${ms(percentile(waits, 50))}, p95 ${ms(percentile(waits, 95))}, max ${ms(Math.max(...waits))}.`,
  );
}

const describe = (list) =>
  list
    .filter((d) => d.status === 200)
    .map((d) => `${d.mbps.toFixed(1)} Mbps`)
    .join(", ") || "failed";
console.log(`\nDownload from production: ${describe(downloads)}`);
console.log(`Download from control:    ${describe(controlDownloads)}`);

if (OUT) {
  await writeFile(
    OUT,
    JSON.stringify({ base: BASE, rows, keepAlive, downloads, controlDownloads, samples: Object.fromEntries(samples) }, null, 2),
  );
  console.log(`Raw samples written to ${OUT}`);
}

const failed = rows.filter((r) => r.verdict === "FAIL");
if (failed.length > 0) {
  console.log(`\nFAIL: ${failed.map((r) => r.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("\nPASS: every layer visible from outside is within budget.");
}
