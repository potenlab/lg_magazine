// Concurrency-gate test for the REAL AIStudioProvider.
//
// Companion to test-aistudio-failover.mjs. Does NOT touch production: it
// transpiles the real src/lib/llm/providers/aistudio.ts and drives it against a
// local mock that (a) holds responses open so we can observe concurrency and
// (b) can force a one-time 500 to exercise the retry path.
//
// Asserts:
//   1. the gate caps concurrent upstream calls at AISTUDIO_MAX_CONCURRENCY,
//   2. requests that wait past AISTUDIO_QUEUE_TIMEOUT_MS throw LlmBusyError,
//   3. a transient upstream 500 is retried in-place and still succeeds.
//
//   node scripts/test-aistudio-gate.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsSource = readFileSync(join(root, "src/lib/llm/providers/aistudio.ts"), "utf8");

// Load a FRESH copy of the provider module (module-level consts read env at eval,
// so each scenario sets its env then imports a cache-busted copy).
async function loadProvider(tag) {
  const js = ts.transpileModule(tsSource + `\n//cachebust:${tag}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

// --- mock LG AI Studio with concurrency tracking + one-time-500 control -------
let inFlight = 0;
let maxInFlight = 0;
let promptHits = 0;
let RESP_DELAY_MS = 150;
const failOnce = new Set(); // codes that should return 500 exactly once

function resetMock() {
  inFlight = 0;
  maxInFlight = 0;
  promptHits = 0;
  failOnce.clear();
}
function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const server = createServer((reqHttp, res) => {
  let body = "";
  reqHttp.on("data", (c) => (body += c));
  reqHttp.on("end", () => {
    const url = reqHttp.url || "";
    const json = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (url.endsWith("/genai/auth/token") || url.endsWith("/genai/auth/refresh")) {
      return json(200, { resultVal: "success", token: fakeJwt(), refreshToken: "r" });
    }
    const m = url.match(/\/genai\/([^/]+)\/prompt\//);
    if (!m) return json(404, { errMsg: "not found" });
    const code = m[1];
    promptHits++;
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    setTimeout(() => {
      inFlight--;
      if (failOnce.has(code)) {
        failOnce.delete(code);
        return json(500, { resultVal: "err", errMsg: "오류가 발생했습니다. 다시 시도해 주세요." });
      }
      return json(200, {
        resultVal: "success",
        message: `reply-from-${code}`,
        tokens: { inputTokens: 10, outputTokens: 4 },
      });
    }, RESP_DELAY_MS);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

function baseEnv() {
  process.env.AISTUDIO_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.AISTUDIO_WORKSPACE_ID = "test-workspace";
  process.env.AISTUDIO_API_KEY = "test-key";
  process.env.AISTUDIO_EMP_NO = "test-emp";
  process.env.AISTUDIO_PROMPT_INDEX = "1";
  process.env.AISTUDIO_API_CODES = "CODE_A,CODE_B,CODE_C,CODE_D";
}
const req = { system: "sys", user: "usr" };
let passed = 0,
  failed = 0;
const ok = (cond, msg) => {
  if (cond) (passed++, console.log(`  ✅ ${msg}`));
  else (failed++, console.log(`  ❌ ${msg}`));
};

// --- TEST 1: gate caps concurrent upstream calls ----------------------------
console.log("\nTest 1 — gate caps concurrency at AISTUDIO_MAX_CONCURRENCY");
resetMock();
RESP_DELAY_MS = 120;
baseEnv();
process.env.AISTUDIO_MAX_CONCURRENCY = "2";
process.env.AISTUDIO_QUEUE_TIMEOUT_MS = "5000";
{
  const { AIStudioProvider } = await loadProvider("t1");
  const p = new AIStudioProvider();
  const results = await Promise.all(Array.from({ length: 6 }, () => p.generateText(req)));
  ok(maxInFlight === 2, `never more than 2 concurrent upstream calls (peak=${maxInFlight})`);
  ok(results.length === 6 && results.every((r) => r.text.startsWith("reply-from-")),
    `all 6 queued requests eventually succeeded`);
}

// --- TEST 2: waiting past the timeout → LlmBusyError -------------------------
console.log("\nTest 2 — queue saturated past timeout → LlmBusyError (→ 429)");
resetMock();
RESP_DELAY_MS = 250;
baseEnv();
process.env.AISTUDIO_MAX_CONCURRENCY = "1";
process.env.AISTUDIO_QUEUE_TIMEOUT_MS = "60";
{
  const { AIStudioProvider, LlmBusyError } = await loadProvider("t2");
  const p = new AIStudioProvider();
  const settled = await Promise.allSettled(Array.from({ length: 4 }, () => p.generateText(req)));
  const busy = settled.filter((s) => s.status === "rejected" && s.reason?.name === "LlmBusyError");
  const okCount = settled.filter((s) => s.status === "fulfilled").length;
  ok(busy.length >= 1, `at least one over-capacity request rejected with LlmBusyError (got ${busy.length})`);
  ok(okCount >= 1, `the request holding the single slot still succeeded (ok=${okCount})`);
  ok(LlmBusyError && busy.every((b) => b.reason instanceof Error),
    `rejections are real LlmBusyError instances`);
}

// --- TEST 3: transient upstream 500 is retried and recovers -----------------
console.log("\nTest 3 — transient 500 retried in-place, request still succeeds");
resetMock();
RESP_DELAY_MS = 0;
baseEnv();
process.env.AISTUDIO_MAX_CONCURRENCY = "5";
process.env.AISTUDIO_QUEUE_TIMEOUT_MS = "5000";
process.env.AISTUDIO_OVERLOAD_RETRIES = "2";
{
  const { AIStudioProvider } = await loadProvider("t3");
  const p = new AIStudioProvider();
  failOnce.add("CODE_A"); // first code hit returns 500 once
  const r = await p.generateText(req);
  ok(r.text.startsWith("reply-from-"), `request succeeded despite a transient 500 (got: ${r.text})`);
  ok(promptHits >= 2, `upstream was retried after the 500 (prompt hits=${promptHits})`);
}

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
