// Smoke-test every AI Studio API code in the failover pool.
// Auths once (workspace JWT), then sends a tiny pass-through prompt to each
// code and reports status / returned text / token usage / quota state.
//
//   node scripts/test-aistudio-pool.mjs
//
// Reads creds + AISTUDIO_API_CODES from .env.local.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const out = {};
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    // strip inline comments only when value isn't quoted
    if (!/^['"]/.test(val)) val = val.replace(/\s+#.*$/, "");
    val = val.trim().replace(/^['"]|['"]$/g, "");
    out[m[1]] = val;
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };

const base = (env.AISTUDIO_BASE_URL || "").replace(/\/+$/, "");
const workspaceId = env.AISTUDIO_WORKSPACE_ID;
const password = env.AISTUDIO_API_KEY;
const empNo = env.AISTUDIO_EMP_NO;
const promptIndex = env.AISTUDIO_PROMPT_INDEX || "1";
const codes = (env.AISTUDIO_API_CODES || env.AISTUDIO_API_CODE || "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

if (!base || !workspaceId || !password || !empNo) {
  console.error("Missing AISTUDIO_* creds in .env.local");
  process.exit(1);
}
if (codes.length === 0) {
  console.error("No AISTUDIO_API_CODES / AISTUDIO_API_CODE set");
  process.exit(1);
}

console.log(`Base: ${base}`);
console.log(`Codes (${codes.length}): ${codes.join(", ")}\n`);

// --- auth once ---
const authRes = await fetch(`${base}/genai/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ID: workspaceId, Password: password }),
});
const authJson = await authRes.json().catch(() => null);
const jwt =
  authJson &&
  (authJson.token || authJson.JWT || authJson.jwt || authJson.accessToken || authJson.Token);
if (!authRes.ok || !jwt) {
  console.error(`Auth failed: ${authRes.status}`, authJson);
  process.exit(1);
}
console.log("Auth OK — JWT acquired\n");

const SYSTEM = "You are a test responder. Reply with exactly: OK";
const USER = "ping";

let pass = 0;
const results = [];

for (const code of codes) {
  const url = `${base}/genai/${code}/prompt/${promptIndex}`;
  const t0 = Date.now();
  let line;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        empNo,
        historyId: null,
        parameters: [
          { key: "SYSTEM", value: SYSTEM },
          { key: "USER", value: USER },
        ],
      }),
    });
    const raw = await res.text();
    const ms = Date.now() - t0;

    if (raw.includes("토큰 호출량")) {
      line = `⚠️  ${code.padEnd(16)} QUOTA-CAPPED (${res.status}, ${ms}ms) — ${raw.slice(0, 120)}`;
      results.push({ code, ok: false, quota: true });
    } else if (!res.ok) {
      line = `❌ ${code.padEnd(16)} HTTP ${res.status} (${ms}ms) — ${raw.slice(0, 160)}`;
      results.push({ code, ok: false });
    } else {
      let data = null;
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      const text =
        data && (data.message || data.response || data.text || data.content || data.result || data.answer || data.output);
      const tok = data && data.tokens;
      const usage = tok ? `in=${tok.inputTokens ?? "?"} out=${tok.outputTokens ?? "?"}` : "no-usage";
      if (text) {
        pass++;
        line = `✅ ${code.padEnd(16)} OK (${ms}ms) [${usage}] → "${String(text).trim().slice(0, 40)}"`;
        results.push({ code, ok: true });
      } else {
        line = `❌ ${code.padEnd(16)} 200 but no text (${ms}ms) — ${raw.slice(0, 160)}`;
        results.push({ code, ok: false });
      }
    }
  } catch (err) {
    line = `❌ ${code.padEnd(16)} threw — ${err?.message ?? err}`;
    results.push({ code, ok: false });
  }
  console.log(line);
}

console.log(`\n${pass}/${codes.length} codes healthy.`);
const bad = results.filter((r) => !r.ok);
if (bad.length) {
  console.log("Failing:", bad.map((b) => b.code + (b.quota ? "(quota)" : "")).join(", "));
  process.exit(2);
}
