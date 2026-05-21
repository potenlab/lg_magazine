# Deep-mode PDF Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user runs `/deep`, generate richer (5-paragraph, deeper) chapter articles in the final magazine PDF, and make PDF page numbers dynamic so chapters that overflow to a second A5 page stay correctly numbered.

**Architecture:** Mirror the existing `deepSuffix` pattern — a `buildChapterDeepBlock()` override block appended to `v3WriteChapterArticle`'s prompt only when `getDeep()` is true, plus a token-limit bump. Separately, convert hardcoded PDF page numbers to react-pdf's dynamic `render`/`fixed` page numbering and drop the TOC number column.

**Tech Stack:** Next.js 16, TypeScript, `@react-pdf/renderer`. **No test runner exists in this project** (confirmed: no `vitest`/`jest`, no `test` script) and adding one is out of scope per the spec — so each task is verified with `npx tsc --noEmit` + `npx eslint`, and a final manual PDF check.

Spec: `docs/superpowers/specs/2026-05-21-pdf-deep-enrichment-design.md`

---

## Task 1: Deep chapter article prompt

**Files:**
- Modify: `src/lib/v3/llm/prompts.ts` (function `v3WriteChapterArticle`, currently starting at line 1078)

Note: `getDeep` is already imported in `prompts.ts` (used by `deepSuffix`). No new import is needed.

- [ ] **Step 1: Add the `buildChapterDeepBlock()` function**

Insert this function immediately *before* the line `export async function v3WriteChapterArticle(input: {`:

```ts
// /deep 토글이 켜졌을 때만 챕터 기사 task 끝에 덧붙는 풍부화 블록.
// 기본 모드에서는 호출되지 않으며, 호출되면 위 [출력 형식]의 분량 제약만 덮어쓴다.
// 톤·금지 규칙(TONE_GUIDE)은 그대로 유지된다.
function buildChapterDeepBlock(): string {
  return `
[OVERRIDE — 적극 서술 모드 (위 [출력 형식]의 분량 제약보다 우선)]
- 위 [출력 형식]의 "본문 3문단, 각 문단 2~3문장" 제약을 해제한다.
- BODY는 5문단, 각 문단 3~4문장으로 쓴다.
- 각 문단은 사건을 단순히 서술하는 데 그치지 말고, 그 순간이 '무엇이었는지' 한 겹 더 해석할 것 — 참가자가 그때 무엇을 감각했고 어떤 결정을 내렸는지.
- 주어진 컨텍스트의 구체 디테일(장소·숫자·인물·시기·역할)을 더 촘촘히 본문에 엮을 것.
- 단, 위 [기록 페이지 톤 가이드]와 [금지 사항]의 모든 규칙은 그대로 유지된다 — 3인칭 회고체, 저널리스틱 산문체, 평가 형용사 금지, 그리고 주어진 컨텍스트에 없는 사실·일화·인물의 임의 생성 절대 금지.
- HEADLINE과 PULL의 형식·길이는 위 [출력 형식] 그대로.`;
}
```

- [ ] **Step 2: Wire the deep block + token bump into `v3WriteChapterArticle`**

In `v3WriteChapterArticle`, find this line (currently line ~1201):

```ts
  const r = await ask(taskByChapter[chapter], 800);
```

Replace it with:

```ts
  const deep = getDeep();
  const task = deep
    ? taskByChapter[chapter] + buildChapterDeepBlock()
    : taskByChapter[chapter];
  const r = await ask(task, deep ? 1800 : 800);
```

- [ ] **Step 3: Verify typecheck + lint pass**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (success).

Run: `npx eslint src/lib/v3/llm/prompts.ts`
Expected: no output, 0 errors/warnings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/v3/llm/prompts.ts
git commit -m "Enrich PDF chapter articles in deep mode

v3WriteChapterArticle appends a buildChapterDeepBlock() override
(5-paragraph, deeper) and bumps the token limit 800 -> 1800 when
getDeep() is true. Non-deep output is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Dynamic PDF page numbering

All five files change together in one commit: removing the `pageNum` prop from a component and removing it from the call site in `MagazinePDF.tsx` must be atomic for `tsc` to pass.

**Files:**
- Modify: `src/lib/v3/pdf/pages/Chapter.tsx`
- Modify: `src/lib/v3/pdf/pages/EditorIntro.tsx`
- Modify: `src/lib/v3/pdf/pages/EditorOutro.tsx`
- Modify: `src/lib/v3/pdf/pages/TOC.tsx`
- Modify: `src/lib/v3/pdf/MagazinePDF.tsx`

- [ ] **Step 1: Rewrite `src/lib/v3/pdf/pages/Chapter.tsx`**

Replace the entire file with:

```tsx
import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

interface Props {
  chapter: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  pullQuote: string | null;
}

const KOR_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "내가 지나온 길",
  2: "나는 누구인가",
  3: "내가 그리는 미래",
  4: "내일로 향하는 한 걸음",
};

export function Chapter({ chapter, headline, body, pullQuote }: Props) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Chapter {chapter}</Text>
      <Text style={styles.chapterLabel}>{KOR_TITLE[chapter]}</Text>
      <Text style={styles.chapterHeadline}>{headline}</Text>
      <View>
        <Text style={styles.body}>{body}</Text>
      </View>
      {pullQuote && (
        <View style={styles.pullQuote}>
          <Text>&#x201C;{pullQuote}&#x201D;</Text>
        </View>
      )}
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
```

- [ ] **Step 2: Rewrite `src/lib/v3/pdf/pages/EditorIntro.tsx`**

Replace the entire file with:

```tsx
import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function EditorIntro({ body }: { body: string }) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>From the Editor</Text>
      <View style={{ marginTop: 8 }}>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
```

- [ ] **Step 3: Rewrite `src/lib/v3/pdf/pages/EditorOutro.tsx`**

Replace the entire file with:

```tsx
import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

interface Props {
  body: string;
  name: string;
  date: string;
}

export function EditorOutro({ body, name, date }: Props) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Editor&apos;s Note</Text>
      <View style={{ marginTop: 8 }}>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={styles.colophon}>
        <Text>Magazine STORY</Text>
        <Text>Vol. {name}</Text>
        <Text>발행일 {date}  ·  인쇄부수 1부</Text>
        <Text>오직 한 사람을 위해 만들어진 특집호.</Text>
        <Text>— 매거진 STORY 편집부</Text>
      </View>
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
```

- [ ] **Step 4: Rewrite `src/lib/v3/pdf/pages/TOC.tsx`**

Replace the entire file with (page-number column removed; section labels only):

```tsx
import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function TOC() {
  const items = [
    "From the Editor",
    "Chapter 1. 내가 지나온 길",
    "Chapter 2. 나는 누구인가",
    "Chapter 3. 내가 그리는 미래",
    "Chapter 4. 내일로 향하는 한 걸음",
    "Editor's Note",
  ];
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Contents</Text>
      <View style={{ marginTop: 12 }}>
        {items.map((label) => (
          <Text key={label} style={styles.tocItem}>
            {label}
          </Text>
        ))}
      </View>
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
```

- [ ] **Step 5: Rewrite `src/lib/v3/pdf/MagazinePDF.tsx`**

Replace the entire file with (all `pageNum={...}` props removed):

```tsx
import { Document } from "@react-pdf/renderer";
import { Cover } from "./pages/Cover";
import { TOC } from "./pages/TOC";
import { EditorIntro } from "./pages/EditorIntro";
import { Chapter } from "./pages/Chapter";
import { EditorOutro } from "./pages/EditorOutro";

export interface MagazineData {
  name: string;
  date: string;
  coverHeadline: string;
  editorIntro: string;
  editorOutro: string;
  chapters: {
    1: { headline: string; body: string; pullQuote: string | null };
    2: { headline: string; body: string; pullQuote: string | null };
    3: { headline: string; body: string; pullQuote: string | null };
    4: { headline: string; body: string; pullQuote: string | null };
  };
}

export function MagazinePDF({ data }: { data: MagazineData }) {
  return (
    <Document title={`STORY Vol. ${data.name}`} author="Magazine STORY 편집부">
      <Cover name={data.name} date={data.date} headline={data.coverHeadline} />
      <TOC />
      <EditorIntro body={data.editorIntro} />
      <Chapter chapter={1} headline={data.chapters[1].headline} body={data.chapters[1].body} pullQuote={data.chapters[1].pullQuote} />
      <Chapter chapter={2} headline={data.chapters[2].headline} body={data.chapters[2].body} pullQuote={data.chapters[2].pullQuote} />
      <Chapter chapter={3} headline={data.chapters[3].headline} body={data.chapters[3].body} pullQuote={data.chapters[3].pullQuote} />
      <Chapter chapter={4} headline={data.chapters[4].headline} body={data.chapters[4].body} pullQuote={data.chapters[4].pullQuote} />
      <EditorOutro body={data.editorOutro} name={data.name} date={data.date} />
    </Document>
  );
}
```

- [ ] **Step 6: Verify typecheck + lint pass**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no output (success). In particular, no "Property 'pageNum' is missing" errors.

Run: `npx eslint src/lib/v3/pdf/pages/Chapter.tsx src/lib/v3/pdf/pages/EditorIntro.tsx src/lib/v3/pdf/pages/EditorOutro.tsx src/lib/v3/pdf/pages/TOC.tsx src/lib/v3/pdf/MagazinePDF.tsx`
Expected: no output, 0 errors/warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/v3/pdf/pages/Chapter.tsx src/lib/v3/pdf/pages/EditorIntro.tsx src/lib/v3/pdf/pages/EditorOutro.tsx src/lib/v3/pdf/pages/TOC.tsx src/lib/v3/pdf/MagazinePDF.tsx
git commit -m "PDF: dynamic page numbers, drop TOC number column

Footer page numbers now use react-pdf render/fixed so chapters that
overflow to a second A5 page stay correctly numbered. Removes the
hardcoded pageNum props and the TOC's hardcoded number column.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Verification (manual — after both tasks)

No automated PDF test exists. Verify by hand:

1. Ensure dev server is running (`npm run dev`).
2. Open `http://localhost:3000/deep` and play through a full session (Ch1–Ch4) so all session fields are filled.
3. On the magazine handoff scene, generate/download the PDF.
4. Confirm:
   - [ ] Each chapter article reads as ~5 paragraphs (visibly richer than before).
   - [ ] When a chapter overflows to a 2nd A5 page, the footer page number is continuous and correct on both pages.
   - [ ] The TOC shows section labels with no page-number column.
   - [ ] No fabricated names/events appeared (spot-check against what was entered).
5. Regression: open `http://localhost:3000` (non-deep), play through, download PDF — confirm it is still the original ~8-page length with ~3-paragraph chapters.
