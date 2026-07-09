// Verifies the dual-model lane routing in AIStudioProvider:
//   tier "light" → AISTUDIO_LIGHT_API_CODES (e.g. GEMINI_FLASH)
//   tier "heavy" → AISTUDIO_API_CODES        (Sonnet pool)
// No network: global.fetch is stubbed to capture the /prompt/ URL per call.
//
// Run: node scripts/test-light-routing.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function transpile(relPath, extraReplace = (s) => s) {
  const src = readFileSync(join(root, relPath), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return "data:text/javascript;base64," + Buffer.from(extraReplace(js)).toString("base64");
}

// modeContext as ONE shared instance (the AsyncLocalStorage store must be the
// same module that aistudio imports getTier from).
const modeUrl = transpile("src/lib/llm/modeContext.ts");
const mode = await import(modeUrl);

// aistudio, with its `../modeContext` import rewired to the shared instance.
const aiUrl = transpile("src/lib/llm/providers/aistudio.ts", (js) =>
  js.replace(/from\s*["']\.\.\/modeContext["']/g, `from ${JSON.stringify(modeUrl)}`),
);
const { AIStudioProvider } = await import(aiUrl);

process.env.AISTUDIO_BASE_URL = "https://aistudio.test";
process.env.AISTUDIO_WORKSPACE_ID = "WS";
process.env.AISTUDIO_API_KEY = "KEY";
process.env.AISTUDIO_EMP_NO = "EMP";
process.env.AISTUDIO_API_CODES = "SONNET_A,SONNET_B";
process.env.AISTUDIO_LIGHT_API_CODES = "GEMINI_FLASH";

const fakeJwt = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ exp })}.sig`;
};

let lastPromptUrl = null;
global.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith("/genai/auth/token") || u.endsWith("/genai/auth/refresh")) {
    return new Response(JSON.stringify({ token: fakeJwt(), refreshToken: "r" }), { status: 200 });
  }
  if (u.includes("/prompt/")) {
    lastPromptUrl = u;
    return new Response(
      JSON.stringify({ message: "ok", tokens: { inputTokens: 1, outputTokens: 1 } }),
      { status: 200 },
    );
  }
  throw new Error("unexpected fetch: " + u);
};

const provider = new AIStudioProvider();

async function call(tier) {
  lastPromptUrl = null;
  await mode.runWithMode(null, false, tier, () =>
    provider.generateText({ system: "s", user: "u", maxTokens: 50 }),
  );
  return lastPromptUrl;
}

let pass = true;
const check = (label, url, expectCode) => {
  const ok = url && url.includes(`/genai/${expectCode}/`);
  console.log(`${ok ? "✓" : "✗"} ${label}: ${url}`);
  if (!ok) pass = false;
};

check("light tier → Gemini", await call("light"), "GEMINI_FLASH");
check("heavy tier → Sonnet", await call("heavy"), "SONNET_A");
// default (no tier set) must stay on the heavy Sonnet pool (any SONNET_* code).
lastPromptUrl = null;
await provider.generateText({ system: "s", user: "u", maxTokens: 50 });
const def = lastPromptUrl;
const defOk = def && /\/genai\/SONNET_[AB]\//.test(def);
console.log(`${defOk ? "✓" : "✗"} default (no context) → Sonnet pool: ${def}`);
if (!defOk) pass = false;

console.log(pass ? "\nALL PASS" : "\nFAILED");
process.exit(pass ? 0 : 1);
