// Time-limit test for the REAL AIStudioProvider.
//
// Transpiles src/lib/llm/providers/aistudio.ts and drives it against a local
// mock AI Studio whose codes can hang, stall mid-body, or answer slowly.
//
// Asserts:
//   1. a call that hangs is cut off at the tier's limit and retried once on the
//      next code, which answers,
//   2. if both tries hang, the call fails after exactly two tries,
//   3. a response whose body stalls is cut off too,
//   4. the limit follows the task tier (light short, heavy long), even when
//      short replies share the heavy lane (no light codes set),
//   5. a timed-out call frees its gate slot for the next request.
//
//   node scripts/test-aistudio-timeout.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsSource = readFileSync(join(root, "src/lib/llm/providers/aistudio.ts"), "utf8");
const transpile = (src) =>
  ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

const modeUrl =
  "data:text/javascript;base64," +
  Buffer.from(transpile(readFileSync(join(root, "src/lib/llm/modeContext.ts"), "utf8"))).toString(
    "base64",
  );
const mode = await import(modeUrl);

async function loadProvider(tag) {
  const js = transpile(tsSource + `\n//cachebust:${tag}`).replace(
    /from\s*["']\.\.\/modeContext["']/g,
    `from ${JSON.stringify(modeUrl)}`,
  );
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

// Capture the provider's JSON log lines.
const events = [];
const origLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith('{"evt"')) {
    events.push(JSON.parse(args[0]));
    return;
  }
  origLog(...args);
};
const timeouts = () => events.filter((e) => e.evt === "llm_upstream_timeout");

// --- mock AI Studio -----------------------------------------------------------
// Code name decides the behaviour:
//   HANG_*      never answers within the test
//   STALL_*     sends headers at once, the body only after 5 s
//   DELAY800_*  answers after 800 ms
//   anything else answers at once
const hits = [];
let authHits = 0;
let authDelayMs = 0;
// Tokens carry a sequence number; tokens below minValidToken get a 401, sent
// back with growing delays so the 401s reach the app one after another.
let tokenSeq = 0;
let minValidToken = 0;
let sent401 = 0;
function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, n: ++tokenSeq })}.sig`;
}
function tokenSeqOf(authHeader) {
  try {
    return JSON.parse(Buffer.from(String(authHeader).split(" ")[1].split(".")[1], "base64url")).n;
  } catch {
    return -1;
  }
}
const server = createServer((reqHttp, res) => {
  let body = "";
  reqHttp.on("data", (c) => (body += c));
  reqHttp.on("end", () => {
    const url = reqHttp.url || "";
    const reply = (code) =>
      JSON.stringify({ resultVal: "success", message: `reply-from-${code}`, tokens: { inputTokens: 5, outputTokens: 3 } });
    if (url.endsWith("/genai/auth/token") || url.endsWith("/genai/auth/refresh")) {
      authHits++;
      const t = setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ resultVal: "success", token: fakeJwt(), refreshToken: "r" }));
      }, authDelayMs);
      res.on("close", () => clearTimeout(t));
      return;
    }
    const m = url.match(/\/genai\/([^/]+)\/prompt\//);
    if (!m) {
      res.writeHead(404);
      return res.end();
    }
    const code = m[1];
    hits.push(code);
    const later = (ms, fn) => {
      const t = setTimeout(fn, ms);
      res.on("close", () => clearTimeout(t));
    };
    if (tokenSeqOf(reqHttp.headers.authorization) < minValidToken) {
      return later(sent401++ * 100, () => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ resultVal: "err", errMsg: "expired" }));
      });
    }
    if (code.startsWith("HANG")) return later(5_000, () => res.end(reply(code)));
    if (code.startsWith("STALL")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"resultVal":"success",');
      return later(5_000, () => res.end('"message":"late"}'));
    }
    const send = () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(reply(code));
    };
    if (code.startsWith("DELAY800")) return later(800, send);
    send();
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

function setEnv({ codes, lightCodes = "", light = "300", heavy = "1500", gate = "5", auth = "2000" }) {
  process.env.AISTUDIO_AUTH_TIMEOUT_MS = auth;
  process.env.AISTUDIO_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.AISTUDIO_WORKSPACE_ID = "w";
  process.env.AISTUDIO_API_KEY = "k";
  process.env.AISTUDIO_EMP_NO = "e";
  process.env.AISTUDIO_PROMPT_INDEX = "1";
  process.env.AISTUDIO_API_CODES = codes;
  process.env.AISTUDIO_LIGHT_API_CODES = lightCodes;
  process.env.AISTUDIO_LIGHT_TIMEOUT_MS = light;
  process.env.AISTUDIO_HEAVY_TIMEOUT_MS = heavy;
  process.env.AISTUDIO_MAX_CONCURRENCY = gate;
  process.env.AISTUDIO_LIGHT_MAX_CONCURRENCY = gate;
  process.env.AISTUDIO_QUEUE_TIMEOUT_MS = "10000";
  process.env.AISTUDIO_OVERLOAD_RETRIES = "0";
}
const req = { system: "sys", user: "usr" };
const asTier = (tier, fn) => mode.runWithMode(null, false, tier, fn);
const reset = () => {
  hits.length = 0;
  events.length = 0;
};

let passed = 0,
  failed = 0;
const ok = (c, m) => {
  if (c) {
    passed++;
    origLog(`  ✅ ${m}`);
  } else {
    failed++;
    origLog(`  ❌ ${m}`);
  }
};

// --- TEST 1 ---------------------------------------------------------------------
origLog("\nTest 1 — a hanging call is cut off and retried on the next code");
reset();
setEnv({ codes: "SONNET", lightCodes: "HANG_A,OK_B" });
{
  const { AIStudioProvider } = await loadProvider("t1");
  const p = new AIStudioProvider();
  const t0 = Date.now();
  const r = await asTier("light", () => p.generateText(req));
  const ms = Date.now() - t0;
  ok(r.text === "reply-from-OK_B", `answer came from the next code (got ${r.text})`);
  ok(ms >= 280 && ms < 1_500, `gave up on the hanging code at the light limit (${ms} ms total)`);
  ok(hits.join(",") === "HANG_A,OK_B", `tried HANG_A then OK_B (hits: ${hits.join(",")})`);
  const t = timeouts();
  ok(t.length === 1 && t[0].code === "HANG_A" && t[0].tier === "light" && t[0].timeoutMs === 300,
    `one llm_upstream_timeout log line for HANG_A (${JSON.stringify(t)})`);
}

// --- TEST 2 ---------------------------------------------------------------------
origLog("\nTest 2 — both tries hang → fails after exactly two tries");
reset();
setEnv({ codes: "SONNET", lightCodes: "HANG_A,HANG_B,HANG_C" });
{
  const { AIStudioProvider } = await loadProvider("t2");
  const p = new AIStudioProvider();
  const t0 = Date.now();
  const err = await asTier("light", () => p.generateText(req)).then(() => null, (e) => e);
  const ms = Date.now() - t0;
  ok(err && /no answer within 300 ms/.test(err.message), `fails with a clear message (${err?.message})`);
  ok(hits.length === 2, `only two tries, not one per code (hits: ${hits.join(",")})`);
  ok(ms >= 560 && ms < 2_000, `fails after about two limits (${ms} ms)`);
}

// --- TEST 3 ---------------------------------------------------------------------
origLog("\nTest 3 — a body that stalls after the headers is cut off too");
reset();
setEnv({ codes: "SONNET", lightCodes: "STALL_A,OK_B" });
{
  const { AIStudioProvider } = await loadProvider("t3");
  const p = new AIStudioProvider();
  const t0 = Date.now();
  const r = await asTier("light", () => p.generateText(req));
  ok(r.text === "reply-from-OK_B", `answer came from the next code (got ${r.text})`);
  ok(Date.now() - t0 < 1_500, `did not wait for the stalled body (${Date.now() - t0} ms)`);
}

// --- TEST 4 ---------------------------------------------------------------------
origLog("\nTest 4 — the limit follows the task tier");
reset();
setEnv({ codes: "DELAY800_A,DELAY800_B", lightCodes: "" });
{
  const { AIStudioProvider } = await loadProvider("t4");
  const p = new AIStudioProvider();
  const heavyRes = await asTier("heavy", () => p.generateText(req));
  ok(heavyRes.text.startsWith("reply-from-DELAY800"), `heavy task waits for an 800 ms answer (limit 1500 ms)`);
  ok(timeouts().length === 0, "no timeout logged for the heavy task");
  reset();
  const err = await asTier("light", () => p.generateText(req)).then(() => null, (e) => e);
  ok(err && /no answer within 300 ms/.test(err.message),
    `short reply on the shared heavy lane still uses the 300 ms light limit (${err?.message})`);
}

// --- TEST 5 ---------------------------------------------------------------------
origLog("\nTest 5 — a timed-out call frees its gate slot");
reset();
setEnv({ codes: "SONNET", lightCodes: "HANG_A,OK_B,OK_C", gate: "1" });
{
  const { AIStudioProvider } = await loadProvider("t5");
  const p = new AIStudioProvider();
  const results = await Promise.allSettled([
    asTier("light", () => p.generateText(req)),
    asTier("light", () => p.generateText(req)),
  ]);
  ok(results.every((r) => r.status === "fulfilled"),
    `both requests succeed through a 1-slot gate (${results.map((r) => r.status).join(",")})`);
}

// --- TEST 6 ---------------------------------------------------------------------
origLog("\nTest 6 — a login (token) timeout is reported as a login problem, not a slow model");
reset();
authHits = 0;
authDelayMs = 1_000;
setEnv({ codes: "SONNET", lightCodes: "OK_A,OK_B", auth: "200" });
{
  const { AIStudioProvider } = await loadProvider("t6");
  const p = new AIStudioProvider();
  const err = await asTier("light", () => p.generateText(req)).then(() => null, (e) => e);
  ok(err && /aistudio auth: no answer within 200 ms/.test(err.message), `clear login error (${err?.message})`);
  ok(timeouts().length === 0, "not logged as llm_upstream_timeout");
  ok(hits.length === 0, `no prompt call was attempted (hits: ${hits.join(",") || "none"})`);
}

// --- TEST 7 ---------------------------------------------------------------------
origLog("\nTest 7 — calls that need a token at the same time share one token request");
reset();
authHits = 0;
authDelayMs = 150;
setEnv({ codes: "SONNET", lightCodes: "OK_A,OK_B" });
{
  const { AIStudioProvider } = await loadProvider("t7");
  const p = new AIStudioProvider();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => asTier("light", () => p.generateText(req))),
  );
  ok(results.every((r) => r.text.startsWith("reply-from-OK")), "all 6 calls answered");
  ok(authHits === 1, `one token request for 6 calls (got ${authHits})`);
  await asTier("light", () => p.generateText(req));
  ok(authHits === 1, `a later call reuses the cached token (got ${authHits})`);
}
authDelayMs = 0;

// --- TEST 8 ---------------------------------------------------------------------
origLog("\nTest 8 — a blank time-limit setting keeps the default instead of 0");
reset();
setEnv({ codes: "SONNET", lightCodes: "DELAY800_A", light: "", auth: " " });
{
  const { AIStudioProvider } = await loadProvider("t8");
  const p = new AIStudioProvider();
  const r = await asTier("light", () => p.generateText(req)).then((x) => x, (e) => e);
  ok(r?.text === "reply-from-DELAY800_A", `an 800 ms answer still arrives (got ${r?.text ?? r?.message})`);
  ok(timeouts().length === 0, "no timeout logged");
}

// --- TEST 9 ---------------------------------------------------------------------
origLog("\nTest 9 — 401s arriving one after another lead to one new login, not several");
reset();
authHits = 0;
authDelayMs = 20;
setEnv({ codes: "SONNET", lightCodes: "OK_A,OK_B" });
{
  const { AIStudioProvider } = await loadProvider("t9");
  const p = new AIStudioProvider();
  await asTier("light", () => p.generateText(req)); // first login
  minValidToken = tokenSeq + 1; // the token in use is now rejected
  sent401 = 0;
  const results = await Promise.all(
    Array.from({ length: 4 }, () => asTier("light", () => p.generateText(req))),
  );
  ok(results.every((r) => r.text.startsWith("reply-from-OK")), "all 4 calls answered after the 401");
  ok(authHits === 2, `one new login for 4 staggered 401s (logins: ${authHits}, want 2)`);
}
authDelayMs = 0;
minValidToken = 0;

server.closeAllConnections?.();
server.close();
origLog(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
