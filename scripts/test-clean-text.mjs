// Verifies cleanText/cleanDeep (src/lib/v3/llm/cleanText.ts): stray characters
// a model drops into Korean replies are removed, real text is left alone.
//
// Run: node scripts/test-clean-text.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/lib/v3/llm/cleanText.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { cleanText, cleanDeep } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

let passed = 0;
let failed = 0;
function eq(got, want, label) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed++;
  else {
    failed++;
    console.error(`FAIL ${label}\n  got:  ${g}\n  want: ${w}`);
  }
}

// The 10 Nov case and its variants.
eq(cleanText("동료들의 Ƭ 피드백을"), "동료들의 피드백을", "stray between spaces → one space");
eq(cleanText("피드Ƭ백"), "피드백", "stray inside a word disappears");
eq(cleanText("피드백Ƭ 을"), "피드백 을", "stray before a space keeps the space");
eq(cleanText("Ƭ시작"), "시작", "stray at start");
eq(cleanText("끝이에요.Ƭ"), "끝이에요.", "stray at end");
eq(cleanText("가ΩЖ나"), "가나", "Greek / Cyrillic run");
eq(cleanText("가�나다"), "가나다", "replacement char + private use");
eq(cleanText("가́나"), "가나", "combining mark");
eq(cleanText("가\u0007나"), "가나", "control char");

// Must stay untouched.
const keep = [
  "아, 작년 가을 ‘신입사원 교육 콘텐츠’를 만드셨군요.",
  "첫 줄\n\n둘째 줄\t탭",
  "“인용” — 그리고… 「제목」 『책』 《매거진》 〈글〉 · 3년 후",
  "LG AI Studio, API 2.2초, 100% OK!",
  "金민재님, café 이야기",
  "ㅎㅎ 그렇군요",
];
for (const s of keep) eq(cleanText(s), s, `keeps: ${s.slice(0, 20)}`);

// cleanDeep walks objects/arrays and leaves non-strings alone.
eq(
  cleanDeep({ headline: "제Ƭ목", body: "본문", pullQuote: null, n: 3, list: ["가Ƭ", { x: "Ƭ나" }] }),
  { headline: "제목", body: "본문", pullQuote: null, n: 3, list: ["가", { x: "나" }] },
  "cleanDeep nested",
);
eq(cleanDeep("A"), "A", "cleanDeep branch letter");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
