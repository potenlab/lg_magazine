// Unit test for the in-memory LLM job queue (src/lib/llm/jobQueue.ts).
// Transpiles the real module and drives it directly — no network, no framework.
//   node scripts/test-llm-jobqueue.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsSource = readFileSync(join(root, "src/lib/llm/jobQueue.ts"), "utf8");
const js = ts.transpileModule(tsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Each call gives a fresh queue instance; the module reads its env at import.
let instance = 0;
async function loadQueue(env) {
  Object.assign(process.env, env);
  const src = `${js}\n// instance ${++instance}\n`;
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}

// Capture the queue's JSON log lines; let everything else print normally.
const events = [];
const origLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith('{"evt"')) {
    events.push(JSON.parse(args[0]));
    return;
  }
  origLog(...args);
};
const eventsFor = (evt, label) => events.filter((e) => e.evt === evt && e.label === label);

const { enqueue, getJob, queueStats } = await loadQueue({
  LLM_QUEUE_CONCURRENCY: "2", // small cap so queueing is observable
  LLM_JOB_TTL_MS: "60000",
});

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

// Shared helper for the lane tests: records start order and live heavy count.
const starts = [];
let heavyActive = 0,
  maxHeavyActive = 0;
const mkTracked = (name, tier, ms) => () => {
  starts.push({ name, tier, at: Date.now() });
  if (tier === "heavy") maxHeavyActive = Math.max(maxHeavyActive, ++heavyActive);
  return sleep(ms).then(() => {
    if (tier === "heavy") heavyActive--;
    return name;
  });
};
const add = (name, tier, ms) => enqueue(mkTracked(name, tier, ms), { tier, label: name });

// --- TEST 4: light jumps ahead of queued heavy ------------------------------
console.log("\nTest 4 — a queued light job goes before an earlier queued heavy job");
starts.length = 0;
add("H1", "heavy", 80);
add("H2", "heavy", 250);
const h3 = add("H3", "heavy", 30);
const l1 = add("L1", "light", 30);
const l2 = add("L2", "light", 30);
ok(getJob(l1).position === 1 && getJob(l2).position === 2, "light jobs are next in line (positions 1, 2)");
ok(getJob(h3).position === 3, `earlier heavy job is behind them (position ${getJob(h3).position})`);
const s4 = queueStats();
ok(
  s4.runningHeavy === 2 && s4.queuedLight === 2 && s4.queuedHeavy === 1 && s4.queued === 3,
  "queueStats reports per-lane counts",
);
await sleep(400);
const order4 = starts.map((s) => s.name).join(",");
ok(order4 === "H1,H2,L1,L2,H3", `start order H1,H2,L1,L2,H3 (got ${order4})`);
ok([h3, l1, l2].every((id) => getJob(id).status === "done"), "all finished");

// --- TEST 5: heavy keeps its reserved slot under a flood of light -----------
console.log("\nTest 5 — a flood of light jobs cannot starve heavy, heavy takes only 1 slot");
starts.length = 0;
maxHeavyActive = 0;
const t0 = Date.now();
const lightIds = [];
for (let i = 0; i < 6; i++) lightIds.push(add(`F${i}`, "light", 40));
const hA = add("HA", "heavy", 100);
const hB = add("HB", "heavy", 100);
let n = 6;
const flood = setInterval(() => lightIds.push(add(`F${n++}`, "light", 40)), 15);
await sleep(400);
clearInterval(flood);
const floodEnd = Date.now();
const startA = starts.find((s) => s.name === "HA");
const startB = starts.find((s) => s.name === "HB");
ok(
  startA && starts.indexOf(startA) === 2,
  `HA took the first free slot, ahead of 4 earlier light jobs (start #${starts.indexOf(startA) + 1})`,
);
ok(startB && startB.at < floodEnd, `HB also started while light jobs kept arriving (+${startB ? startB.at - t0 : "?"}ms)`);
ok(startB && startB.at - startA.at >= 95, "HB waited for HA to finish instead of taking a second slot");
ok(maxHeavyActive === 1, `never more than 1 heavy running while light was waiting (peak=${maxHeavyActive})`);
await sleep(1500);
ok(
  [hA, hB, ...lightIds].every((id) => getJob(id).status === "done"),
  `all ${lightIds.length + 2} jobs finished once the flood stopped`,
);

// --- TEST 6: failures are logged as one JSON line ---------------------------
console.log("\nTest 6 — job errors are logged as llm_job_error");
const e1 = enqueue(() => Promise.reject(new Error("upstream 503")), { tier: "light", label: "reflectShort" });
const e2 = enqueue(() => Promise.reject(new Error("x".repeat(1000))), { label: "longErr" });
const e3 = enqueue(() => {
  throw new Error("sync throw");
}, { tier: "light", label: "syncThrow" });
await sleep(60);
const [ev1] = eventsFor("llm_job_error", "reflectShort");
ok(
  ev1 && ev1.tier === "light" && ev1.error === "upstream 503" && typeof ev1.queuedMs === "number" && typeof ev1.runMs === "number",
  `llm_job_error line has label, tier, error, queuedMs, runMs (${JSON.stringify(ev1)})`,
);
const [ev2] = eventsFor("llm_job_error", "longErr");
ok(ev2 && ev2.tier === "heavy" && ev2.error.length === 300, "default tier is heavy and long errors are cut to 300 chars");
ok(getJob(e2).error.length === 1000, "the job itself keeps the full error for the client");
ok(getJob(e3).status === "error" && eventsFor("llm_job_error", "syncThrow").length === 1, "a synchronous throw is caught and logged");
ok(queueStats().running === 0, "no slot leaked after the failures");
ok(getJob(e1).status === "error", "failed job reports status=error");
ok(events.filter((e) => e.evt !== "llm_job_error").length === 0, "successful jobs log nothing");

// --- TEST 7: slow and expired jobs are logged (separate instance) -----------
console.log("\nTest 7 — slow wait logged once, expiry logged as llm_job_error");
const q2 = await loadQueue({
  LLM_QUEUE_CONCURRENCY: "1",
  LLM_JOB_SLOW_MS: "50",
  LLM_QUEUE_MAX_AGE_MS: "150",
});
q2.enqueue(() => sleep(250), { label: "blocker" });
const late = q2.enqueue(() => sleep(10), { tier: "light", label: "late" });
await sleep(80);
q2.getJob(late);
await sleep(20);
q2.getJob(late);
const slow = eventsFor("llm_job_slow", "late");
ok(slow.length === 1 && slow[0].queuedMs > 50 && slow[0].runningHeavy === 1, "llm_job_slow logged once while queued");
await sleep(250);
const lj = q2.getJob(late);
ok(lj.status === "error" && lj.error === "expired_in_queue", "job past max age expires in queue");
const [exp] = eventsFor("llm_job_error", "late");
ok(exp && exp.error === "expired_in_queue" && exp.runMs === null && exp.queuedMs > 150, "expiry logged with runMs=null");
ok(eventsFor("llm_job_slow", "late").length === 1, "still only one slow line for that job");

// --- TEST 8: light head start is limited (heavy aging) ----------------------
// Two slots. A long heavy job holds the reserved heavy slot for the whole test,
// so only the aging rule can put a queued heavy job ahead of a light one.
console.log("\nTest 8 — heavy that waited past the light head start goes first");
const order3 = [];
const track = (name, ms) => async () => {
  order3.push(name);
  await sleep(ms);
  return name;
};
async function agingRun(agingEnv, gapMs) {
  order3.length = 0;
  const q = await loadQueue({
    LLM_QUEUE_CONCURRENCY: "2",
    LLM_QUEUE_HEAVY_MIN: "1",
    LLM_QUEUE_HEAVY_AGING_MS: agingEnv,
    LLM_QUEUE_MAX_AGE_MS: "60000",
    LLM_JOB_SLOW_MS: "60000",
  });
  q.enqueue(track("longHeavy", 600));
  q.enqueue(track("lightBlocker", 300), { tier: "light" });
  q.enqueue(track("queuedHeavy", 10));
  await sleep(gapMs);
  q.enqueue(track("queuedLight", 10), { tier: "light" });
  await sleep(500 - gapMs);
  return order3.slice(2).join(",");
}
let got = await agingRun("100", 150);
ok(got === "queuedHeavy,queuedLight", `heavy waiting >100ms longer goes first (got ${got})`);
got = await agingRun("100", 20);
ok(got === "queuedLight,queuedHeavy", `inside the head start light still goes first (got ${got})`);
got = await agingRun("", 150);
ok(got === "queuedLight,queuedHeavy", `empty env keeps the 60s default, not 0 (got ${got})`);
got = await agingRun("abc", 150);
ok(got === "queuedLight,queuedHeavy", `invalid env keeps the 60s default (got ${got})`);

// --- TEST 9: long-poll waitForJob ---------------------------------------------
console.log("\nTest 9 — waitForJob returns the moment a job finishes, or at its limit");
{
  const q = await loadQueue({
    LLM_QUEUE_CONCURRENCY: "1",
    LLM_QUEUE_MAX_AGE_MS: "360000",
    LLM_JOB_SLOW_MS: "60000",
  });
  const elapsed = async (p) => {
    const t0 = Date.now();
    await p;
    return Date.now() - t0;
  };

  const fast = q.enqueue(() => sleep(120).then(() => "fast-result"), { tier: "light" });
  let ms = await elapsed(q.waitForJob(fast, 5_000));
  ok(ms >= 100 && ms < 400, `woke when the job finished, not at the 5 s limit (${ms} ms)`);
  ok(q.getJob(fast).status === "done" && q.getJob(fast).result === "fast-result", "result is ready right after waking");

  ms = await elapsed(q.waitForJob(fast, 5_000));
  ok(ms < 20, `already finished → returns at once (${ms} ms)`);
  ms = await elapsed(q.waitForJob("no-such-id", 5_000));
  ok(ms < 20, `unknown id → returns at once (${ms} ms)`);

  const failing = q.enqueue(() => sleep(80).then(() => { throw new Error("boom"); }), { tier: "light" });
  ms = await elapsed(q.waitForJob(failing, 5_000));
  ok(ms < 400 && q.getJob(failing).status === "error", `woke on a failed job too (${ms} ms)`);

  const slow = q.enqueue(() => sleep(600).then(() => "slow"), { tier: "heavy" });
  ms = await elapsed(q.waitForJob(slow, 150));
  ok(ms >= 140 && ms < 400 && q.getJob(slow).status === "running", `stops at the limit while still running (${ms} ms)`);

  const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  ms = await elapsed(q.waitForJob(slow, 5_000, ac.signal));
  ok(ms >= 90 && ms < 400, `stops early when the browser goes away (${ms} ms)`);

  const queued = q.enqueue(() => sleep(50).then(() => "behind"), { tier: "heavy" });
  ok(q.getJob(queued).status === "queued", "second job waits behind the slow one (cap=1)");
  const [a, b] = await Promise.all([elapsed(q.waitForJob(queued, 5_000)), elapsed(q.waitForJob(queued, 5_000))]);
  ok(q.getJob(queued).status === "done" && Math.abs(a - b) < 50,
    `two waiters on a queued job both wake when it finishes (${a} / ${b} ms)`);

  ms = await elapsed(q.waitForJob(slow, 0));
  ok(ms < 20, `wait of 0 returns at once (${ms} ms)`);
}

// --- TEST 10: queued jobs nobody asks about are dropped, not run ---------------
console.log("\nTest 10 — a queued job the browser stopped asking about is dropped, not run");
{
  const q = await loadQueue({
    LLM_QUEUE_CONCURRENCY: "1",
    LLM_QUEUE_MAX_AGE_MS: "360000",
    LLM_JOB_ABANDON_MS: "150",
  });
  const ran = [];
  const job = (name, ms) => () => sleep(ms).then(() => (ran.push(name), name));
  q.enqueue(job("blocker", 400), { tier: "heavy", label: "blocker" });
  const gone = q.enqueue(job("gone", 10), { tier: "light", label: "gone" }); // never asked about again
  const polled = q.enqueue(job("polled", 10), { tier: "light", label: "polled" });
  const held = q.enqueue(job("held", 10), { tier: "light", label: "held" });
  const timer = setInterval(() => q.getJob(polled), 50); // a live browser checking
  const heldDone = q.waitForJob(held, 5_000); // a live browser holding a check
  await sleep(700);
  clearInterval(timer);
  await heldDone;
  ok(q.getJob(gone).status === "error" && q.getJob(gone).error === "abandoned", "the unwatched job was dropped as abandoned");
  ok(!ran.includes("gone"), `the unwatched job never ran (ran: ${ran.join(",")})`);
  ok(q.getJob(polled).status === "done", "the job a browser kept checking ran");
  ok(q.getJob(held).status === "done", "the job with a held check ran");
  const ab = events.filter((e) => e.evt === "llm_job_abandoned");
  ok(ab.length === 1 && ab[0].label === "gone", `one llm_job_abandoned log line (${JSON.stringify(ab)})`);
  ok(eventsFor("llm_job_error", "gone").length === 0, "not counted as llm_job_error");
}

// --- TEST 11: heavy jobs get longer before being dropped; blank env is safe ---
console.log("\nTest 11 — heavy jobs keep their place longer; a blank setting keeps the default");
{
  const q = await loadQueue({
    LLM_QUEUE_CONCURRENCY: "1",
    LLM_JOB_ABANDON_MS: "100",
    LLM_JOB_ABANDON_HEAVY_MS: "400",
  });
  q.enqueue(() => sleep(250), { tier: "heavy", label: "blocker-a" });
  const heavyShort = q.enqueue(() => sleep(10).then(() => "h"), { tier: "heavy", label: "heavy-250" });
  const lightShort = q.enqueue(() => sleep(10).then(() => "l"), { tier: "light", label: "light-250" });
  await sleep(450);
  ok(q.getJob(lightShort).error === "abandoned", "light job unwatched for 250 ms is dropped (limit 100 ms)");
  ok(q.getJob(heavyShort).status === "done", "heavy job unwatched for 250 ms still runs (limit 400 ms)");

  q.enqueue(() => sleep(600), { tier: "heavy", label: "blocker-b" });
  const heavyLong = q.enqueue(() => sleep(10), { tier: "heavy", label: "heavy-600" });
  await sleep(800);
  ok(q.getJob(heavyLong).error === "abandoned", "heavy job unwatched for 600 ms is dropped (limit 400 ms)");

  const q2 = await loadQueue({
    LLM_QUEUE_CONCURRENCY: "1",
    LLM_JOB_ABANDON_MS: "",
    LLM_JOB_ABANDON_HEAVY_MS: "  ",
  });
  q2.enqueue(() => sleep(200), { tier: "heavy", label: "blocker-c" });
  const blankLight = q2.enqueue(() => sleep(10).then(() => "ran"), { tier: "light", label: "blank-env" });
  await sleep(350);
  ok(q2.getJob(blankLight).status === "done", "blank LLM_JOB_ABANDON_MS keeps the 30 s default (job not dropped)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
