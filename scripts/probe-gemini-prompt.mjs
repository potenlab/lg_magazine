// Probe which prompt index the GEMINI_FLASH code actually has.
// Loads .env.local, authenticates, then tries /genai/GEMINI_FLASH/prompt/<n>
// for n = 1..8 and reports which one returns a real reply.
//
// Run: node scripts/probe-gemini-prompt.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith("'") || v.startsWith('"')) v = v.slice(1, v.indexOf(v[0], 1));
  else {
    const h = v.indexOf(" #");
    v = (h === -1 ? v : v.slice(0, h)).trim();
  }
  env[m[1]] = v;
}

const BASE = env.AISTUDIO_BASE_URL.replace(/\/+$/, "");
const CODE = (env.AISTUDIO_LIGHT_API_CODES || "GEMINI_FLASH").split(",")[0].trim();

const auth = await fetch(`${BASE}/genai/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ID: env.AISTUDIO_WORKSPACE_ID, Password: env.AISTUDIO_API_KEY }),
});
const authData = await auth.json();
const jwt = authData.token || authData.JWT || authData.jwt;
if (!jwt) {
  console.error("auth failed:", JSON.stringify(authData));
  process.exit(1);
}

const body = JSON.stringify({
  empNo: env.AISTUDIO_EMP_NO,
  historyId: null,
  parameters: [
    { key: "SYSTEM", value: "한국어로 한 문장만 답하세요." },
    { key: "USER", value: "안녕하세요." },
  ],
});

console.log(`probing code=${CODE} on ${BASE}\n`);
for (let n = 1; n <= 8; n++) {
  const res = await fetch(`${BASE}/genai/${CODE}/prompt/${n}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body,
  });
  const raw = await res.text();
  let mark = "—";
  try {
    const d = JSON.parse(raw);
    if (d.message || d.response || d.text || d.result) mark = "✅ REPLY";
    else if (/Prompt Not Exists/i.test(raw)) mark = "✗ no prompt";
    else mark = `? ${d.errMsg || d.resultVal || ""}`;
  } catch {
    mark = `? ${raw.slice(0, 60)}`;
  }
  console.log(`prompt/${n}: [${res.status}] ${mark}  ${raw.slice(0, 90)}`);
}
