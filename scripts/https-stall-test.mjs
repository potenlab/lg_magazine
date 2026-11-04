#!/usr/bin/env node
// Do new connections to production stall, and only alongside real HTTPS traffic?
//
//   node scripts/https-stall-test.mjs
//
// Found on 2026-11-02: new connections to port 443 of our IP stalled by 1-3s, but
// only while real HTTPS requests were flowing from the same source. Bare
// handshakes alone never stalled, so a test without real requests cannot see it.
//
// This alternates blocks with and without real HTTPS requests, measuring in each:
//   ours :443    TCP handshake, the port under suspicion
//   ours :80     TCP handshake, shows whether the whole IP is affected
//   LG :443      TCP handshake to www.lgacademy.com, same network block
//   ours https   real request, only in https blocks, sends no cookie
//
// One connection at a time. Requests hit /api/auth/qrius/me, which is cheap and
// answers 401 without touching the database or spending AI Studio tokens.
//
// Exits 1 if over 5% of port 443 handshakes stall during the https blocks. To
// confirm a fix, require CLEAN from several runs at different hours.

import net from "node:net";
import tls from "node:tls";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OURS = "203.247.146.226";
const OURS_NAME = "mybook.lgacademy.com";
const NEIGHBOUR = "203.247.146.177";
const BLOCK_MS = Math.max(10, Number(process.env.BLOCK_SECONDS || 75)) * 1000;
const STEP_MS = 300;
const ROUND_GAP_MS = 800;
const TIMEOUT_MS = 9_000;
const STALL_MS = 600;
const MAX_STALL_PCT = 5;
const BLOCKS = ["no-https", "https", "no-https", "https", "no-https", "https"];

function handshake(host, port) {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve({ ok, ms: performance.now() - start });
    };
    socket.setTimeout(TIMEOUT_MS, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// Returns the TCP connect time, so it is comparable with the handshake arms.
function httpsRequest() {
  return new Promise((resolve) => {
    const start = performance.now();
    let connectMs = null;
    const socket = tls.connect({ host: OURS, port: 443, servername: OURS_NAME });
    const done = (ok) => {
      socket.destroy();
      resolve({ ok, ms: connectMs ?? performance.now() - start });
    };
    socket.setTimeout(TIMEOUT_MS, () => done(false));
    socket.once("connect", () => {
      connectMs = performance.now() - start;
    });
    socket.once("secureConnect", () => {
      socket.write(`GET /api/auth/qrius/me HTTP/1.1\r\nHost: ${OURS_NAME}\r\nConnection: close\r\n\r\n`);
      socket.once("data", () => done(true));
    });
    socket.once("error", () => done(false));
  });
}

const HANDSHAKES = [
  ["ours :443", () => handshake(OURS, 443)],
  ["ours :80", () => handshake(OURS, 80)],
  ["LG :443", () => handshake(NEIGHBOUR, 443)],
];
const ARMS = [...HANDSHAKES, ["ours https", httpsRequest]];

const shuffled = (list) =>
  list
    .map((item) => [Math.random(), item])
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);

const blocks = [];
console.log("block  kind      UTC       ours :443  ours :80   LG :443    ours https");

for (const [index, kind] of BLOCKS.entries()) {
  const arms = kind === "https" ? ARMS : HANDSHAKES;
  const tally = Object.fromEntries(ARMS.map(([name]) => [name, { n: 0, stalled: 0, failed: 0 }]));
  const startedAt = new Date().toISOString().slice(11, 19);
  const end = Date.now() + BLOCK_MS;

  while (Date.now() < end) {
    for (const [name, run] of shuffled(arms)) {
      const { ok, ms } = await run();
      tally[name].n++;
      if (!ok) tally[name].failed++;
      else if (ms >= STALL_MS) tally[name].stalled++;
      await sleep(STEP_MS);
    }
    await sleep(ROUND_GAP_MS);
  }

  const cell = (name) => (tally[name].n ? `${tally[name].stalled}/${tally[name].n}` : "-").padEnd(10);
  console.log(
    `${String(index + 1).padEnd(6)} ${kind.padEnd(9)} ${startedAt}  ${cell("ours :443")} ${cell("ours :80")} ${cell("LG :443")} ${cell("ours https")}`,
  );
  blocks.push({ kind, tally });
}

const total = (kind, name) =>
  blocks
    .filter((b) => b.kind === kind)
    .reduce(
      (sum, b) => ({
        n: sum.n + b.tally[name].n,
        stalled: sum.stalled + b.tally[name].stalled,
        failed: sum.failed + b.tally[name].failed,
      }),
      { n: 0, stalled: 0, failed: 0 },
    );
const label = ({ stalled, n }) => `${stalled}/${n}`;
const quiet = total("no-https", "ours :443");
const busy = total("https", "ours :443");
const busyPct = busy.n ? (busy.stalled / busy.n) * 100 : 0;

console.log(`\nours :443 stalled: ${label(quiet)} without HTTPS, ${label(busy)} with HTTPS`);
console.log(`ours :80 with HTTPS: ${label(total("https", "ours :80"))}, LG :443 with HTTPS: ${label(total("https", "LG :443"))}`);

const failures = quiet.failed + busy.failed;
if (failures > 0) console.log(`Connection failures on ours :443: ${failures}`);

if (busy.stalled === 0 && quiet.stalled === 0) {
  console.log("\nCLEAN: no stalls in any block.");
} else if (quiet.stalled === 0) {
  console.log("\nTRAFFIC-DEPENDENT: port 443 stalls only alongside real HTTPS traffic.");
} else {
  console.log("\nCONSTANT: port 443 stalls without HTTPS traffic too, so the pattern has changed.");
}

if (busyPct > MAX_STALL_PCT) process.exitCode = 1;
