// Unit test for the in-memory LLM job queue (src/lib/llm/jobQueue.ts).
// Transpiles the real module and drives it directly — no network, no framework.
//   node scripts/test-llm-jobqueue.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

process.env.LLM_QUEUE_CONCURRENCY = "2"; // small cap so queueing is observable
process.env.LLM_JOB_TTL_MS = "60000";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsSource = readFileSync(join(root, "src/lib/llm/jobQueue.ts"), "utf8");
const js = ts.transpileModule(tsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { enqueue, getJob } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

let passed = 0,
  failed = 0;
const ok = (c, m) => {
  if (c) (passed++, console.log(`  ✅ ${m}`));
  else (failed++, console.log(`  ❌ ${m}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- TEST 1: concurrency cap, FIFO position, result delivery ----------------
console.log("\nTest 1 — cap=2: 2 run, rest queue, all finish with their own result");
let active = 0,
  maxActive = 0;
const mkJob = (val, ms) => () => {
  active++;
  maxActive = Math.max(maxActive, active);
  return sleep(ms).then(() => {
    active--;
    return val;
  });
};
const ids = [];
for (let i = 0; i < 6; i++) ids.push(enqueue(mkJob(`r${i}`, 80)));

const snap0 = ids.map(getJob);
ok(snap0.filter((j) => j.status === "running").length === 2, "exactly 2 jobs running immediately (cap=2)");
ok(snap0.filter((j) => j.status === "queued").length === 4, "the other 4 are queued");
const firstQueued = snap0.find((j) => j.status === "queued");
ok(firstQueued && firstQueued.position >= 1, `queued jobs report a 1-based position (got ${firstQueued?.position})`);

await sleep(450);
const done = ids.map(getJob);
ok(done.every((j) => j.status === "done"), "all 6 jobs completed");
ok(
  done.map((j) => j.result).join(",") === ids.map((_, i) => `r${i}`).join(","),
  "each job returned its own result in order",
);
ok(maxActive === 2, `never more than 2 ran at once (peak=${maxActive})`);

// --- TEST 2: a throwing job is captured as error ----------------------------
console.log("\nTest 2 — a throwing job surfaces as status=error");
const errId = enqueue(() => Promise.reject(new Error("boom")));
await sleep(60);
const ej = getJob(errId);
ok(ej && ej.status === "error" && /boom/.test(ej.error), `error captured with message ("${ej?.error}")`);

// --- TEST 3: unknown id → null (→ 404) --------------------------------------
console.log("\nTest 3 — unknown job id returns null");
ok(getJob("does-not-exist") === null, "unknown job id returns null");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
