// Monte-Carlo simulation of AI Studio token consumption for the V3 magazine
// flow. Models one person's ~27 LLM calls with realistic variance, runs N
// simulated users through the 10-code round-robin pool, and checks the result
// against each code's daily (10M) and per-minute (500K) token caps.
//
// Pure model — does NOT call the real API. No quota burned.
//
//   node scripts/simulate-token-usage.mjs [users] [eventHours]
//   e.g. node scripts/simulate-token-usage.mjs 1000 8

const USERS = Number(process.argv[2] || 1000);
const EVENT_HOURS = Number(process.argv[3] || 8); // window users complete within
const CODES = 10;
const DAILY_CAP = 10_000_000; // per code
const MINUTE_CAP = 500_000; // per code
const DEEP_RATE = 0.2; // fraction of users in deep-interpretation mode
const SESSION_MIN = 12; // avg minutes a user spends answering

const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
const jitter = (base, pct = 0.15) => base * rnd(1 - pct, 1 + pct);

// Per-task model. inBase = system persona (~3K Korean) + typical user/context.
// outMax = max_tokens ceiling from prompts.ts. outFrac = realistic fraction of
// the ceiling actually produced (short reflections rarely fill the cap).
// order ≈ when in the session the call fires (0=start .. 1=final assembly).
const TASKS = [
  { task: "judgeBranch",              n: 4, inBase: 3300, outMax: 100,  outFrac: 0.9, order: 0.15 },
  { task: "comfortReassure",          n: 4, inBase: 3300, outMax: 220,  outFrac: 0.8, order: 0.2 },
  { task: "reflectShort",             n: 1, inBase: 3500, outMax: 280,  outFrac: 0.85, deepMax: 1000, order: 0.3 },
  { task: "reflectPoetic",            n: 1, inBase: 3500, outMax: 250,  outFrac: 0.85, deepMax: 1000, order: 0.4 },
  { task: "reflectValues",            n: 1, inBase: 3500, outMax: 320,  outFrac: 0.85, deepMax: 1000, order: 0.45 },
  { task: "reflectStrength",          n: 1, inBase: 3500, outMax: 300,  outFrac: 0.85, order: 0.5 },
  { task: "rephraseLight",            n: 1, inBase: 3300, outMax: 320,  outFrac: 0.8, order: 0.35 },
  { task: "extractKeyword",           n: 1, inBase: 3200, outMax: 80,   outFrac: 0.7, order: 0.25 },
  { task: "observePattern",           n: 1, inBase: 3500, outMax: 300,  outFrac: 0.8, order: 0.55 },
  { task: "generateVisionDirections", n: 1, inBase: 4500, outMax: 1200, outFrac: 0.85, order: 0.6 },
  { task: "generateTimeHorizon",      n: 1, inBase: 4000, outMax: 500,  outFrac: 0.8, order: 0.65 },
  { task: "synthesizeStrength",       n: 1, inBase: 5500, outMax: 2200, outFrac: 0.9, order: 0.7 },
  { task: "synthesizeGrowthVision",   n: 1, inBase: 6000, outMax: 2400, outFrac: 0.9, order: 0.75 },
  { task: "writeChapterArticle",      n: 4, inBase: 5000, outMax: 800,  outFrac: 0.9, deepMax: 1800, order: 0.9 },
  { task: "writeEditorNote",          n: 2, inBase: 5000, outMax: 400,  outFrac: 0.85, order: 0.92 },
  { task: "writeCoverHeadline",       n: 1, inBase: 4000, outMax: 100,  outFrac: 0.9, order: 0.95 },
];

// Build one person's call list with per-call token draws. Returns {calls,totIn,totOut}.
function simulatePerson() {
  const deep = Math.random() < DEEP_RATE;
  const calls = [];
  let totIn = 0;
  let totOut = 0;
  for (const t of TASKS) {
    for (let i = 0; i < t.n; i++) {
      const inTok = Math.round(jitter(t.inBase));
      const ceiling = deep && t.deepMax ? t.deepMax : t.outMax;
      const outTok = Math.round(ceiling * t.outFrac * rnd(0.7, 1.0));
      calls.push({ task: t.task, order: t.order, in: inTok, out: outTok });
      totIn += inTok;
      totOut += outTok;
    }
  }
  return { deep, calls, totIn, totOut, total: totIn + totOut };
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
const fmt = (n) => n.toLocaleString("en-US");
const M = (n) => (n / 1e6).toFixed(2) + "M";

// --- per-person sample (printed breakdown) ---
const sample = simulatePerson();
console.log("=".repeat(64));
console.log(`SAMPLE PERSON  (mode: ${sample.deep ? "deep" : "standard"})`);
console.log("=".repeat(64));
const byTask = {};
for (const c of sample.calls) {
  byTask[c.task] ??= { n: 0, in: 0, out: 0 };
  byTask[c.task].n++;
  byTask[c.task].in += c.in;
  byTask[c.task].out += c.out;
}
console.log("task".padEnd(26) + "calls".padStart(6) + "in".padStart(10) + "out".padStart(8) + "total".padStart(10));
for (const [task, v] of Object.entries(byTask)) {
  console.log(
    task.padEnd(26) +
      String(v.n).padStart(6) +
      fmt(v.in).padStart(10) +
      fmt(v.out).padStart(8) +
      fmt(v.in + v.out).padStart(10),
  );
}
console.log("-".repeat(60));
console.log(
  "TOTAL".padEnd(26) +
    String(sample.calls.length).padStart(6) +
    fmt(sample.totIn).padStart(10) +
    fmt(sample.totOut).padStart(8) +
    fmt(sample.total).padStart(10),
);

// --- run N users ---
const totals = [];
const codeDaily = new Array(CODES).fill(0);
const minuteBuckets = new Map(); // minuteIndex -> tokens (aggregate, all codes)
const codeMinute = new Map(); // `${code}:${minute}` -> tokens
let cursor = 0;
let grandIn = 0;
let grandOut = 0;
let perMinuteHits = 0;

for (let u = 0; u < USERS; u++) {
  const p = simulatePerson();
  totals.push(p.total);
  grandIn += p.totIn;
  grandOut += p.totOut;

  // user finishes at a random time within the event window
  const startMin = Math.floor(rnd(0, EVENT_HOURS * 60 - SESSION_MIN));
  for (const c of p.calls) {
    const callMin = startMin + Math.floor(c.order * SESSION_MIN);
    const tok = c.in + c.out;
    // round-robin assign a code
    const code = cursor % CODES;
    cursor++;
    codeDaily[code] += tok;
    minuteBuckets.set(callMin, (minuteBuckets.get(callMin) || 0) + tok);
    const k = `${code}:${callMin}`;
    const cur = (codeMinute.get(k) || 0) + tok;
    codeMinute.set(k, cur);
    if (cur > MINUTE_CAP) perMinuteHits++;
  }
}

const grand = grandIn + grandOut;
console.log("\n" + "=".repeat(64));
console.log(`AGGREGATE — ${fmt(USERS)} users over a ${EVENT_HOURS}h window`);
console.log("=".repeat(64));
console.log(`Per-person total:  min ${fmt(pct(totals,0))}  p50 ${fmt(pct(totals,0.5))}  mean ${fmt(Math.round(totals.reduce((a,b)=>a+b)/totals.length))}  p95 ${fmt(pct(totals,0.95))}  max ${fmt(pct(totals,0.999))}`);
console.log(`Grand total:       ${M(grand)} tokens   (in ${M(grandIn)} / out ${M(grandOut)})`);

console.log("\nPer-code DAILY load (cap 10M each):");
const overDay = codeDaily.filter((d) => d > DAILY_CAP).length;
codeDaily.forEach((d, i) => {
  const barLen = Math.round((d / DAILY_CAP) * 30);
  const bar = "#".repeat(Math.min(30, barLen)) + (barLen > 30 ? ">" : "");
  console.log(`  LG_BOOK_${String(i === 0 ? "GENERIC" : i + 1).padEnd(7)} ${M(d).padStart(7)} ${((d/DAILY_CAP)*100).toFixed(0).padStart(3)}% ${bar}`);
});

// peak minute (aggregate across all codes)
let peakMin = 0;
let peakTok = 0;
for (const [min, tok] of minuteBuckets) if (tok > peakTok) { peakTok = tok; peakMin = min; }
const aggMinuteCap = MINUTE_CAP * CODES;

console.log("\nThroughput:");
console.log(`  Peak aggregate minute:  ${M(peakTok)}/min  (pool cap ${M(aggMinuteCap)}/min)`);
console.log(`  Per-code per-minute cap breaches: ${perMinuteHits} call-bucket(s)`);

console.log("\n" + "=".repeat(64));
console.log("VERDICT");
console.log("=".repeat(64));
console.log(`Daily:    ${overDay === 0 ? "PASS" : "FAIL"} — ${overDay}/${CODES} codes exceed 10M/day  (pool ${M(grand)}/${M(DAILY_CAP*CODES)})`);
console.log(`Minute:   ${peakTok <= aggMinuteCap ? "PASS" : "TIGHT/FAIL"} — peak ${M(peakTok)} vs ${M(aggMinuteCap)} pool/min`);
const needCodes = Math.ceil(grand / DAILY_CAP);
console.log(`Codes needed for this daily volume: ${needCodes} (have ${CODES})`);
