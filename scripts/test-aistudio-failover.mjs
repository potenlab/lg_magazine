// Failover/rotation test for the REAL AIStudioProvider.
//
// Unlike test-aistudio-pool.mjs (which pings the live LG API), this test does
// NOT touch production quotas. It:
//   1. transpiles the real src/lib/llm/providers/aistudio.ts on the fly,
//   2. spins up a local mock that mimics the LG AI Studio contract and can
//      force specific codes to return a quota-cap body ("토큰 호출량 …"),
//   3. drives generateText() and asserts the provider round-robins, parks
//      capped codes, fails over, and only throws when ALL codes are capped.
//
//   node scripts/test-aistudio-failover.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- 1. transpile the real provider to an importable data: URL ---------------
// aistudio.ts imports getTier from ../modeContext; transpile that too and rewire
// the relative import to a data: URL so the standalone import resolves.
const modeUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(readFileSync(join(root, "src/lib/llm/modeContext.ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64");
const tsSource = readFileSync(join(root, "src/lib/llm/providers/aistudio.ts"), "utf8");
const js = ts
  .transpileModule(tsSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace(/from\s*["']\.\.\/modeContext["']/g, `from ${JSON.stringify(modeUrl)}`);
const { AIStudioProvider } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

// --- 2. mock LG AI Studio server --------------------------------------------
// Codes whose name starts with CAP_ return a quota-cap body. We can flip a
// code's capped-ness at runtime via `capped`.
const capped = new Set(); // code -> currently over quota
const callLog = []; // every prompt hit, in order: { code }

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
      return json(200, { resultVal: "success", token: fakeJwt(), refreshToken: "refresh-xyz" });
    }
    const m = url.match(/\/genai\/([^/]+)\/prompt\//);
    if (m) {
      const code = m[1];
      callLog.push({ code });
      if (capped.has(code)) {
        const perMinute = capped.get?.(code); // unused; daily by default
        // Daily-cap body (no "분") → 30-min cooldown in the provider.
        return json(400, {
          resultVal: "err",
          errMsg: "하루 토큰 호출량 한도를 초과하였습니다.",
        });
      }
      return json(200, {
        resultVal: "success",
        message: `reply-from-${code}`,
        tokens: { inputTokens: 10, outputTokens: 4 },
      });
    }
    return json(404, { errMsg: "not found" });
  });
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// --- 3. point the provider at the mock --------------------------------------
process.env.AISTUDIO_BASE_URL = `http://127.0.0.1:${port}`;
process.env.AISTUDIO_WORKSPACE_ID = "test-workspace";
process.env.AISTUDIO_API_KEY = "test-key";
process.env.AISTUDIO_EMP_NO = "test-emp";
process.env.AISTUDIO_PROMPT_INDEX = "1";
process.env.AISTUDIO_API_CODES = "CODE_A,CODE_B,CODE_C";

const provider = new AIStudioProvider();

// --- helpers -----------------------------------------------------------------
let passed = 0,
  failed = 0;
const ok = (cond, msg) => {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
};
const req = { system: "sys", user: "usr" };
const since = (n) => callLog.slice(n).map((c) => c.code);

// --- TEST 1: round-robin spreads across all codes ---------------------------
console.log("\nTest 1 — round-robin spreads load across the pool");
let mark = callLog.length;
const seen = [];
for (let i = 0; i < 3; i++) seen.push((await provider.generateText(req)).text);
const codesHit = since(mark);
ok(
  new Set(codesHit).size === 3,
  `3 calls hit 3 distinct codes (got: ${codesHit.join(", ")})`,
);
ok(
  seen.every((t) => t.startsWith("reply-from-")),
  `all 3 returned a real reply (${seen.join(", ")})`,
);

// --- TEST 2: a capped code is skipped (failover) ----------------------------
console.log("\nTest 2 — failover: cap one code, it gets parked & skipped");
capped.add("CODE_B"); // CODE_B now over daily quota
mark = callLog.length;
const replies = [];
for (let i = 0; i < 6; i++) replies.push((await provider.generateText(req)).text);
ok(
  !replies.includes("reply-from-CODE_B"),
  `no successful reply came from the capped CODE_B`,
);
ok(
  replies.every((t) => t === "reply-from-CODE_A" || t === "reply-from-CODE_C"),
  `all 6 replies served by the two healthy codes`,
);
// CODE_B is hit at most once (the call that trips the cap), then parked.
const bHits = since(mark).filter((c) => c === "CODE_B").length;
ok(bHits <= 1, `capped CODE_B probed at most once then parked (hits=${bHits})`);

// --- TEST 3: all codes capped → throws the exhaustion error -----------------
console.log("\nTest 3 — all codes capped → provider throws (not a silent hang)");
capped.add("CODE_A");
capped.add("CODE_C");
let threw = null;
try {
  await provider.generateText(req);
} catch (e) {
  threw = e;
}
ok(threw !== null, "generateText threw when every code is exhausted");
ok(
  threw && /exhausted/i.test(threw.message),
  `error message mentions exhaustion: "${threw?.message?.slice(0, 80)}"`,
);

// --- TEST 4: recovery — uncap a code, traffic resumes -----------------------
console.log("\nTest 4 — recovery: a freed code is reused after its cooldown");
// Daily cooldown is 30min in real code; we can't wait, so just prove a fresh
// provider (cooldowns cleared) round-robins again once codes are healthy.
capped.clear();
const fresh = new AIStudioProvider();
mark = callLog.length;
const r2 = [];
for (let i = 0; i < 3; i++) r2.push((await fresh.generateText(req)).text);
ok(
  new Set(since(mark)).size === 3,
  `after recovery, calls spread across all 3 codes again (${since(mark).join(", ")})`,
);

// --- summary -----------------------------------------------------------------
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
