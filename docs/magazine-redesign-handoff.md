# 매거진 PDF 리디자인 인계서 (2026 시안 적용)

## 📍 현재 위치
- **레포**: `/Users/seojimin/Desktop/potenlab/lg_magazine` (Next.js 16, potenlab 폴더 안에 위치)
- **GitHub**: `potenlab/lg_magazine`, 브랜치 `main`
- **HEAD(원격 최신)**: `a7e00c0` — 이후 작업은 **전부 미커밋 상태** (아래 "미커밋 파일" 참조)
- **커밋 author 규칙**: `git -c user.name="Potenlab" -c user.email="dev@potenlab.dev" commit ...`
- **커밋·푸시는 명시 요청 시에만** (아직 안 함)
- **라이브 프리뷰**: `http://localhost:3000/pdf-preview` (Cover / TOC / Editor Intro / Ch 1~4 / Editor Outro / Appendix / Back Page / 전체 탭)
  - dev 서버가 이 환경에서 가끔 꺼짐 → `preview_start` 또는 `npm run dev` 로 재기동
  - `npm install`(npm ci)이 된 상태여야 함 (재클론 시 `node_modules` 없어서 install 필요했음)
  - HMR 리로드 시 가끔 `/api/auth/...` 로 튕김 → `location.href='http://localhost:3000/pdf-preview'` 로 재이동

## 🎯 목표
`~/Desktop/[포텐랩] 영업자료준비 LG 인화원.pdf` (10페이지, pymupdf로 렌더 확인) 를 시안으로, 매거진 PDF 전체를 리디자인.
사용자가 각 페이지 HTML/Tailwind 스펙(1122×1587 기준)도 제공함 → **스케일 ×0.5303 (595/1122)** 로 A4 변환.

## 🎨 디자인 시스템 (전부 토큰화 완료)
`src/lib/v3/pdf/styles.ts`:
```ts
export const MAG = { bg: "#FCF6EE", text: "#4B2A2B", accent: "#892224" };
export const MAG_FONT = { kor: "MaruBuri", eng: "Old Standard TT" };
```
- 배경 크림 `#FCF6EE` · 본문 갈색 `#4B2A2B` · 포인트 와인 `#892224` · 장식 따옴표 핑크 `#9d174d`
- **폰트**: 한글 = MaruBuri, 영문 디스플레이(magazine STORY 등) = Old Standard TT
  - 폰트 파일 `public/fonts/v3/` 에 설치 완료: MaruBuri-{Regular,SemiBold,Bold}.ttf, OldStandard-{Regular,Bold,Italic}.ttf
  - `src/lib/v3/pdf/fonts.ts` 에 등록됨 (registerPdfFonts). react-pdf는 TTF 필요(OTF/woff2 불가)라 TTF로 넣음.

## 🧩 공통 컴포넌트/헬퍼 (신규)
- **`src/lib/v3/pdf/MagazineFrame.tsx`** — 모든 콘텐츠 페이지 공통 프레임
  - 헤더: `Vol.{name}`(top 30, left 30, MaruBuri 600, 11pt) / `magazine STORY`(top 30, right 30, Old Standard 700, 13pt) / 룰(top 50, 좌우 30)
  - 푸터: 룰(bottom 50, 좌우 30) / 페이지번호(bottom 20, 중앙, "현재/전체" 동적)
  - 모든 요소 `fixed` (wrap 페이지 반복). Cover/BackPage 엔 미사용.
  - `export const MAG_MARGIN = 30;` (사방 여백)
  - `export const MAG_CONTENT_TOP = 80;` (콘텐츠 시작 = 헤더 룰 50 + 30)
- **`src/lib/v3/pdf/magazineParts.tsx`** — 챕터 파츠
  - `splitCols(body, leftRatio=0.62)` — 본문 2단 분할, **좌단 62%** (우단은 hero+인용박스가 위 차지 → 텍스트 짧게 균형)
  - `DropCapText` (기본 14pt/줄간격 1.9/드롭캡 +4=18pt), `BodyText` (14pt/1.9), `QuoteBox` (와인박스+크림글씨+핑크따옴표 44pt+`by.`)

## 📄 페이지별 현황 (`src/lib/v3/pdf/pages/`)
페이지 순서(MagazinePDF.tsx + pdf-preview 탭·전체): **Cover → TOC → Editor's Letter → Ch1~4 → Editor's Note → Appendix → Back**

| 페이지 | 파일 | 상태 |
|---|---|---|
| **Cover** | `Cover.tsx` | ✅ 완료. 베이크된 cover.jpg + 오버레이 3개(날짜 우상단 right30 / VOL right30 top210 / 헤드라인 left30) MaruBuri. `formatDate`→"01 Jun. 2026" |
| **TOC** | `TOC.tsx` | ✅ 완료. Contents(64pt) + arrow.png(80, top85 right30) + 2단 목차(대제목↔목차 60, 우측컬럼 marginTop 180 stagger, bottom 90 anchor). 항목: 룰↔라벨 20, 라벨↔sub 12 |
| **Editor's Letter** | `EditorIntro.tsx` | ✅ 완료. **전폭 단일 본문**(문장마다 줄바꿈, 14pt/1.9) 하단정렬(`justifyContent:flex-end`) → 타이틀("Editor's" SemiBold+" Letter" Bold, 26pt) → 본문(marginTop 20) → hero(marginTop 40, paddingBottom 80으로 하단룰 30 위) |
| **Ch1** | `Chapter.tsx` (Ch1~4 공통) | 🔧 **상세작업 중**. 절대 2단: 좌(left30, LEFT_W 265: 라벨15+부제26+드롭캡본문) / 우(top80 right0, RIGHT_W 280: hero 원본비율(폭만 지정) + 인용박스(marginTop -30 겹침, 폭 250=RIGHT_W-30, alignSelf flex-end) + 우단본문). 라벨↔부제 12, 부제↔본문 40 |
| **Ch2~4** | `Chapter.tsx` | ⚠️ Ch1 통합 레이아웃 그대로 적용됨. **시안 고유 차이 미반영**: Ch2 상단 인용박스(크림), Ch3 두 번째 이미지(`Chapter 3(1).jpg`), Ch4 인용 없음(이미 처리) |
| **Editor's Note** | `EditorOutro.tsx` | ✅ 1차. 중앙정렬: "Editor's Note"(26pt) + outro.jpg(352×231) + 중앙본문(13pt/1.7) |
| **Appendix** | `Appendix.tsx` | ✅ 1차. 프레임/토큰/MaruBuri 전환. Q&A 카드 + 페이지분할 로직(wrap/orphans/widows/minPresenceAhead) 유지. 라벨"Appendix"(16 와인)+타이틀(25) |
| **Back** | `BackPage.tsx` | ✅ 1차. 와인 풀블리드(단색 #892224) + 중앙 "magazine STORY / VISION EXPRESS"(Old Standard) + 우하단 콜로폰 |

## 🖼️ 이미지 (`public/`) — 단일 이미지 체계 (variant (1)/(2) 무시)
`imageSets.ts`: `getIntroImage()→"/Editor's Letter(1).jpg"`, `getChapterImage(n)`: Ch1`/Chapter 1.jpg` Ch2`/Chapter 2(1).jpg` Ch3`/Chapter 3.jpg`(고정 hero) Ch4`/Chapter 4.jpg`. `getChapter3Accent()→"/Chapter 3(1).jpg"`(2번째 이미지, 미사용).
- 이미지 원본 비율: Ch1 0.86(세로), Ch2(1) 1.85(가로), Ch3 0.636(세로 긺), Ch4 0.82(세로)
- **삭제된 참조**: paper.jpg(→배경 단색), back page.jpg(→와인 단색), intro(1).jpg(→Editor's Letter(1).jpg)
- Cover/outro.jpg 는 사용자가 교체함

## 📝 본문 생성 규칙 (참고, `src/lib/v3/llm/`)
- **챕터 본문 캡**: `CHAPTER_BODY_MAX_CHARS` = **520** (원래 420 → 레이아웃 채우려 상향). Ch4는 `clampBodyKeepingEnding`(맺음말 보존, CHAPTER4_BODY_MAX_CHARS 430) — **주의: Ch4 캡은 아직 430, 통일 필요할 수 있음**
- **프롬프트 목표 글자수는 아직 ~400자** → 실제 생성분이 레이아웃(520) 대비 짧게 나옴. **프롬프트 목표를 ~500자로 올려야 실제로 2단이 참** (사용자: "실제 진행 시 글자 수 조정" 예정)
- Ch4 맺음말: 본문 마지막 = "{대명사}가 만들어갈 다음 호를 기대해 보자." (독립 새 문단)
- 인트로(Editor's Letter): "{name}님을 만났다." 로 시작하는 4문장 구조
- Editor's Note(outro): 정체성 카드(핵심가치·비전) 녹인 본문, "이 한 호가 …등불이 되기를." 로 끝
- 프리뷰 SAMPLE 본문은 **임시 텍스트**(pdf-preview/page.tsx). 실제 PDF는 `data.chapters[n].body`(LLM 생성분) 사용.

## ✅ 다음 작업 (우선순위)
1. **Ch1 상세 마무리** (진행 중) — 인용박스/hero/컬럼 미세조정
2. **Ch2~4 시안 고유 레이아웃** — Ch2 상단 크림 인용박스, Ch3 2번째 이미지 배치, 각 hero 폭(원본비율이라 Ch3는 폭 280이면 높이 440으로 너무 큼 → 폭 조정 필요)
3. **본문 프롬프트 목표 글자수 상향** (~500자) + Ch4 캡 통일
4. Editor's Note / Appendix / Back 상세 조정
5. **커밋** (아직 미커밋 — 폰트/이미지/신규컴포넌트 포함 대량)

## ⚠️ 미커밋 파일 (전량)
- 신규: `MagazineFrame.tsx`, `magazineParts.tsx`, `public/arrow.png`, `public/Editor's Letter(1).jpg`, `public/Chapter 3.jpg`, 폰트 6개(MaruBuri 3 + OldStandard 3)
- 수정: `styles.ts`, `fonts.ts`, `imageSets.ts`, `MagazinePDF.tsx`, `articleSanitize.ts`, `pdf-preview/page.tsx`, 페이지 8개(Cover/TOC/EditorIntro/Chapter/EditorOutro/Appendix/BackPage), 이미지 교체(cover/Chapter1/Chapter2(1)/Chapter4/outro)
- 삭제: `paper.jpg`, `back page.jpg`, `intro(1).jpg`, `Chapter 2.jpg`

## 🛠️ 작업 팁
- 수정 후 `npx esbuild <file> --bundle=false --format=esm` 로 문법 빠르게 검증 (프로젝트 tsc는 느림)
- 스케일: 시안 px × **0.5303** = A4 pt
- react-pdf 절대위치는 **페이지(테두리) 기준** — Page padding 영향 안 받음. 원본 비율 이미지는 `<Image style={{width: W}}/>` (높이 미지정 → 자동)
- 사용자 선호: **응답에 스크린샷 X** (프리뷰 직접 봄), 커밋·푸시는 명시 요청 시에만
