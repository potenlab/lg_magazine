# 최종 매거진 PDF — deep 모드 풍부화 설계

- 날짜: 2026-05-21
- 상태: 승인 대기 (사용자 리뷰 전)

## 배경

deep 모드(`?deep` / `/deep` 경로)는 현재 reflection 태스크 3종
(`reflectShort` / `reflectPoetic` / `reflectValues`)에만 영향을 준다.
중간 매거진(2-10 `synthesizeStrength`, 3-10 성장 종합)과 최종 매거진 **PDF**는
deep과 무관하게 출력이 동일하다.

화면에 표시되는 중간 매거진(2-10/3-10)은 고정 grid 레이아웃이라 분량을 늘리면
오버플로우가 난다. 반면 최종 PDF는 본질적으로 다중 페이지 흐름 문서라 더 긴 본문을
무리 없이 흡수할 수 있다. 따라서 deep식 풍부화를 적용할 곳은 **PDF뿐**이다.

## 목표

`/deep` 경로로 진행한 사용자의 최종 매거진 PDF에서, 4개 챕터 기사 본문을
더 깊고 더 길게 생성한다. 기본(비-deep) 경로의 PDF는 현재 분량을 그대로 유지한다.

## 결정 사항 (브레인스토밍 합의)

| 항목 | 결정 |
| --- | --- |
| "풍부하게"의 의미 | 깊이 + 분량 둘 다. 챕터당 최대 2 A5 페이지 감수 |
| 적용 범위 (대상자) | `/deep` 사용자만. 기본 경로는 현재 분량 유지 |
| 적용 범위 (PDF 파트) | 챕터 기사 4개만. 편집장 노트(intro/outro)·표지 헤드라인은 변경 없음 |
| 프롬프트 방식 | A안 — `deepSuffix`식 오버라이드 블록 |
| 페이지 번호 방식 | A안 — 동적 번호(`fixed` + `render`), TOC 숫자 칼럼 제거 |

## 비-목표 (Non-goals)

- 중간 매거진 2-10 / 3-10 풍부화 (고정 grid라 오버플로우)
- 편집장 노트(`v3WriteEditorNote`) · 표지 헤드라인(`v3WriteCoverHeadline`) 변경
- 풀쿼트 개수 변경 (챕터당 1개 유지, ch4는 없음)
- 테스트 러너 도입 (프로젝트에 테스트 인프라 없음 — 범위 밖)

## 설계

### 섹션 1 — 딥 챕터 기사 프롬프트

변경 대상: `src/lib/v3/llm/prompts.ts` 의 `v3WriteChapterArticle` (현 1078행~)

- **`buildChapterDeepBlock()` 신설** — 공용 오버라이드 블록 1개.
  `getDeep()`가 `true`일 때만 `taskByChapter[chapter]` 문자열 끝에 덧붙인다.
  reflection의 `deepSuffix` / `buildDeepBlock` 과 동일한 패턴.
  챕터별 `요건` 문구는 그대로 둔다.
- **블록 내용:**
  - `[OVERRIDE]` 기존 "본문 3문단, 각 2~3문장" 제약을 해제하고
    **5문단, 각 문단 3~4문장**으로 재지정.
  - 각 문단은 사건을 단순 서술하지 말고 *그 순간이 무엇이었는지* 한 겹 더
    해석할 것. 세션 데이터의 구체 디테일(장소·숫자·인물·시기·역할)을 더
    촘촘히 엮을 것.
  - 기존 `TONE_GUIDE`의 모든 규칙은 그대로 유지된다 (블록은 분량 제약만
    덮어쓴다): 3인칭 회고체, 저널리스틱 산문체, 평가 형용사 금지,
    그리고 **답변에 없는 사실·일화·인물의 임의 생성 절대 금지**.
- **토큰 상향:** `ask(taskByChapter[chapter], getDeep() ? 1800 : 800)`.
- **출력 파싱 불변:** `HEADLINE` / `BODY` / `PULL` 정규식 그대로.
- **비-deep 경로 불변:** 블록 미부착, 토큰 800, 출력 동일.

deep 감지는 추가 배선이 필요 없다. `realLLM.callTask`가 모든 task 요청에
`x-llm-deep` 헤더를 싣고, `/api/v3/llm` 라우트가 `runWithMode(mode, deep, …)`로
핸들러를 감싸므로 `v3WriteChapterArticle` 내부에서 `getDeep()`가 곧바로 동작한다.

### 섹션 2 — 페이지 번호 동적 전환

deep 챕터 기사가 2 A5 페이지로 늘어나면 뒤 섹션의 하드코딩 페이지 번호가
모두 어긋난다. 푸터 번호를 react-pdf 동적 번호로 전환한다.

변경 대상: `src/lib/v3/pdf/` 의 `pages/Chapter.tsx`, `pages/EditorIntro.tsx`,
`pages/EditorOutro.tsx`, `pages/TOC.tsx`, `MagazinePDF.tsx`

1. **푸터 동적화** — 각 페이지의 푸터 번호를 다음으로 교체:
   ```
   <Text style={styles.pageFooter}>{pageNum}</Text>
   →
   <Text style={styles.pageFooter} fixed render={({ pageNumber }) => pageNumber} />
   ```
   `fixed`로 인해 한 `<Page>`가 여러 물리 페이지로 넘쳐도 각 페이지에
   올바른 번호가 찍힌다.
2. **`pageNum` prop 제거** — `Chapter` / `EditorIntro` / `EditorOutro`의
   Props 정의와 `MagazinePDF.tsx`의 `pageNum={3..8}` 6개를 모두 삭제.
   `Cover`는 푸터 번호가 없으므로 제외.
3. **`TOC.tsx`** — 하드코딩된 페이지 번호 칼럼(`03`~`08`)을 제거하고
   섹션명만 나열한다:
   ```
   From the Editor
   Chapter 1. 내가 지나온 길
   Chapter 2. 나는 누구인가
   Chapter 3. 내가 그리는 미래
   Chapter 4. 내일로 향하는 한 걸음
   Editor's Note
   ```
   라벨에 "Chapter 1~4"가 이미 있어 목차의 안내 기능은 유지된다.
   (렌더 전에는 챕터 시작 페이지를 알 수 없어 정확한 숫자 계산은 불가)

페이지 번호 동적화는 deep / 비-deep **양쪽 모두**에 적용된다. 비-deep PDF는
여전히 8페이지이므로 번호가 동일하게 찍혀 무해하다. PDF 본문 *내용*은
deep일 때만 풍부해진다.

## 검증

프로젝트에 테스트 러너가 없으므로:

1. `npx tsc --noEmit` 통과
2. `npx eslint` 변경 파일 0 errors
3. `/deep` 경로로 진행해 PDF를 받아 육안 확인:
   - 챕터 기사가 5문단으로 길어졌는지
   - 챕터가 2페이지로 분기될 때 푸터 번호가 연속적으로 맞는지
   - TOC가 숫자 없이 섹션명만 표시되는지
4. 기본(비-deep) 경로 PDF가 기존과 동일한 8페이지·분량인지 회귀 확인

## 영향 파일 요약

| 파일 | 변경 |
| --- | --- |
| `src/lib/v3/llm/prompts.ts` | `buildChapterDeepBlock()` 추가, `v3WriteChapterArticle`에 deep 분기 + 토큰 상향 |
| `src/lib/v3/pdf/MagazinePDF.tsx` | `pageNum` prop 전달 제거 |
| `src/lib/v3/pdf/pages/Chapter.tsx` | 푸터 동적화, `pageNum` prop 제거 |
| `src/lib/v3/pdf/pages/EditorIntro.tsx` | 푸터 동적화, `pageNum` prop 제거 |
| `src/lib/v3/pdf/pages/EditorOutro.tsx` | 푸터 동적화, `pageNum` prop 제거 |
| `src/lib/v3/pdf/pages/TOC.tsx` | 페이지 번호 칼럼 제거, 푸터 동적화 |
