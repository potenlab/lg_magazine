// LIVE local test of the dual-model routing against the REAL AI Studio.
// Loads .env.local, then makes two real calls:
//   - light tier  → should hit AISTUDIO_LIGHT_API_CODES (GEMINI_FLASH)
//   - heavy tier  → should hit AISTUDIO_API_CODES (Sonnet pool)
// Wraps fetch only to LOG the /prompt/ URL (the call itself is real).
//
// Run: node scripts/test-light-live.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- load .env.local into process.env (quotes + inline comments handled) ------
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith("'") || v.startsWith('"')) {
    const q = v[0];
    v = v.slice(1, v.indexOf(q, 1) === -1 ? undefined : v.indexOf(q, 1));
  } else {
    const h = v.indexOf(" #");
    if (h !== -1) v = v.slice(0, h);
    v = v.trim();
  }
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}

function transpile(rel, replace = (s) => s) {
  const js = ts.transpileModule(readFileSync(join(root, rel), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return "data:text/javascript;base64," + Buffer.from(replace(js)).toString("base64");
}

const modeUrl = transpile("src/lib/llm/modeContext.ts");
const mode = await import(modeUrl);
const aiUrl = transpile("src/lib/llm/providers/aistudio.ts", (js) =>
  js.replace(/from\s*["']\.\.\/modeContext["']/g, `from ${JSON.stringify(modeUrl)}`),
);
const { AIStudioProvider } = await import(aiUrl);

// real fetch, but log the prompt URL so we can see which code was used
const realFetch = global.fetch;
let lastUrl = null;
global.fetch = (url, opts) => {
  const u = String(url);
  if (u.includes("/prompt/")) lastUrl = u.replace(process.env.AISTUDIO_BASE_URL, "");
  return realFetch(url, opts);
};

console.log("heavy codes:", process.env.AISTUDIO_API_CODES);
console.log("light codes:", process.env.AISTUDIO_LIGHT_API_CODES, "\n");

const provider = new AIStudioProvider();
const SYSTEM = "당신은 따뜻한 편집장입니다. 한국어로 정확히 한 문장만 답하세요.";
const USER = "새로운 도전을 앞두고 기대 반 걱정 반이에요.";

async function run(tier) {
  lastUrl = null;
  const t0 = Date.now();
  try {
    const r = await mode.runWithMode(null, false, tier, () =>
      provider.generateText({ system: SYSTEM, user: USER, maxTokens: 120 }),
    );
    const ms = Date.now() - t0;
    console.log(`[${tier}] code-path: ${lastUrl}  (${ms}ms)`);
    console.log(`[${tier}] reply: ${r.text.slice(0, 120)}`);
    console.log(`[${tier}] tokens:`, r.usage ?? "(none)", "\n");
  } catch (e) {
    console.log(`[${tier}] code-path: ${lastUrl}`);
    console.log(`[${tier}] ERROR: ${e instanceof Error ? e.message : e}\n`);
  }
}

await run("light"); // → GEMINI_FLASH
await run("heavy"); // → Sonnet pool
