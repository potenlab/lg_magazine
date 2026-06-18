import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";
import { getChapterImage, type ImageVariant } from "../imageSets";
import { clampBodyToCompleteSentence } from "../../llm/articleSanitize";

/**
 * Chapter pages — 챕터별 시안이 달라 단일 컴포넌트 안에서 chapter 번호에
 * 따라 4가지 레이아웃으로 분기. 모든 페이지는 /paper.jpg 를 풀-블리드
 * 배경으로 깔고 그 위에 hero image / 텍스트 오버레이.
 *
 *   Ch1: Vol. 헤더 + 상단 hero + 제목 좌·소제목 우 + body 1-col + bottom pullQuote
 *   Ch2: STORY 헤더 + 중앙 타이틀 + body 1-col + 중간 룰 + 좌하 hero + 우하 pullQuote
 *   Ch3: Vol. 헤더 + 중앙 타이틀 + body 1-col + inline pullQuote + 하단 hero
 *   Ch4: Vol. 헤더 + 좌상 hero + 우상 타이틀 + body 1-col
 *
 *   좌표는 A4 (595 × 842pt) 기준.
 */
interface Props {
  chapter: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  pullQuote: string | null;
  name: string;
  variant: ImageVariant;
}

const TEXT = "#3d2414";
const MUTED = "#7a5a3a";
const WINE = "#59282E";
const RULE = "#59282E";
const PAPER = "/paper.jpg";

const KOR_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "내가 지나온 길",
  2: "나는 누구인가",
  3: "내가 그리는 미래",
  4: "내일로 향하는 한 걸음",
};
const SUBTITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "숫자로 증명받는 순간들",
  2: "삶의 항로를 직접 그리는 사람",
  3: "살아있음을 느끼는 지도",
  4: "매일, 한 줄씩 항로를 긋는다",
};
// 이미지 세트는 imageSets.getChapterImage(chapter, variant) 로 resolve.
// Ch1·Ch4 는 variant 무관 단일 자산.

/** Hero 이미지 모서리 와인 색 삼각 액센트 (액자 효과).
 *  Ch1 등에서 <CornerAccent corner="tr|tl|br|bl" /> 로 사용. */
function CornerAccent({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const base = {
    position: "absolute" as const,
    width: 0,
    height: 0,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  };
  const size = 18;
  if (corner === "tl") return <View style={{ ...base, top: 0, left: 0, borderBottomWidth: size, borderRightWidth: size, borderBottomColor: WINE }} />;
  if (corner === "tr") return <View style={{ ...base, top: 0, right: 0, borderBottomWidth: size, borderLeftWidth: size, borderBottomColor: WINE }} />;
  if (corner === "bl") return <View style={{ ...base, bottom: 0, left: 0, borderTopWidth: size, borderRightWidth: size, borderTopColor: WINE }} />;
  return <View style={{ ...base, bottom: 0, right: 0, borderTopWidth: size, borderLeftWidth: size, borderTopColor: WINE }} />;
}


// ── Ch1 ─────────────────────────────────────────────────────────
// 1-col + Page wrap. 본문이 길면 자동으로 다음 페이지로 흘러감.
// paper.jpg + Vol.{name} 헤더는 `fixed` 로 모든 페이지에 반복.
// Hero / Title / Subtitle 은 첫 페이지 상단(flow), PullQuote 는 body 뒤 flow.
function Chapter1Page({ name, body, pullQuote, sub, variant }: { name: string; body: string; pullQuote: string | null; sub: string; variant: ImageVariant }) {
  return (
    // Page 에 padding 직접 부여 — wrap 페이지에도 동일 적용(헤더 간격 일관).
    // paddingTop 71 = 헤더 영역(top 20 + 텍스트~14 + rule mt 12 + 1 ≈ 47) + breathing 24.
    <Page size="A4" wrap style={{ paddingHorizontal: 46, paddingTop: 71, paddingBottom: 50 }}>
      {/* paper bg — fixed (모든 페이지 반복) */}
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* Header — fixed + absolute(top 20): flow 공간 차지 없이 모든 페이지 동일 위치. */}
      <View fixed style={{ position: "absolute", top: 20, left: 46, right: 46 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
        </View>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 12 }} />
      </View>

      {/* Hero — #1 (flow). marginTop 0: Page paddingTop 71 이 헤더 아래 갭 담당. */}
      <View style={{ height: 157, overflow: "hidden", position: "relative" }}>
        <Image src={getChapterImage(1, variant)} style={{ width: 503, height: 157, objectFit: "cover" }} />
      </View>

      {/* Title row — flex-start (상단 정렬). 룰·부제 간격 20 으로 통일. */}
      <View style={{ marginTop: 24, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT }}>{KOR_TITLE[1]}</Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 1.</Text>
      </View>
      <View style={{ height: 1, backgroundColor: RULE, marginTop: 20, width: 80 }} />

      {/* Subtitle — dynamic headline (TOC sub 와 동일), 비면 static fallback */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, marginTop: 20, color: TEXT }}>
        {sub || SUBTITLE[1]}
      </Text>

      {/* Body 1-col — wrap 가능 (본문 길면 다음 페이지로) */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 16 }}>
        {body}
      </Text>

      {/* PullQuote — 절대 좌표 bottom 46 anchor (페이지 하단 고정). top 제한 없음. */}
      {pullQuote && (
        <View
          style={{
            position: "absolute",
            left: 46,
            right: 46,
            bottom: 46,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginRight: 14, marginTop: -10 }}>
            &#x201C;
          </Text>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 19, fontWeight: 700, color: TEXT, textAlign: "center", lineHeight: 1.6 }}>
              {pullQuote}
            </Text>
          </View>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginLeft: 14, marginBottom: -16 }}>
            &#x201D;
          </Text>
        </View>
      )}
    </Page>
  );
}

// ── Ch2 ─────────────────────────────────────────────────────────
// Page wrap. 본문이 길면 자동으로 다음 페이지로 흐름.
// 헤더(paper bg + magazine STORY 룰)는 fixed 로 모든 페이지에 반복.
function Chapter2Page({ name, body, pullQuote, sub, variant }: { name: string; body: string; pullQuote: string | null; sub: string; variant: ImageVariant }) {
  return (
    // Page 에 padding 직접 부여 — wrap 페이지 헤더 간격 일관 (paddingTop 71).
    <Page size="A4" wrap style={{ paddingHorizontal: 46, paddingTop: 71, paddingBottom: 50 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* fixed header — absolute(top 20): 모든 페이지 동일 위치, flow 공간 X. */}
      <View fixed style={{ position: "absolute", top: 20, left: 46, right: 46 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
        </View>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 12 }} />
      </View>

      {/* 타이틀 블록 — #1 marginTop 0 (Page paddingTop 가 갭 담당). 좌측 정렬. */}
      <View style={{ alignItems: "flex-start" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 2.</Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 8 }}>{KOR_TITLE[2]}</Text>
        <View style={{ marginTop: 20, width: 70, height: 1, backgroundColor: RULE }} />
      </View>

      {/* 부제 — 좌측 정렬 */}
      <View style={{ alignItems: "flex-start", marginTop: 20 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT }}>{sub || SUBTITLE[2]}</Text>
      </View>

      {/* Body — 1-col flow. 길면 다음 페이지로. */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 16 }}>
        {body}
      </Text>

      {/* 본문 ↔ 하단 블록 사이 가로 룰 — 하단 블록(bottom 46 + hero 155) 24 위.
          → bottom = 46 + 155 + 24 = 225 */}
      <View style={{ position: "absolute", left: 46, right: 46, bottom: 225, height: 1, backgroundColor: RULE }} />

      {/* 하단: 좌 hero + 우 pullQuote. bottom 46 anchor (top 제한 없음).
          alignItems: "flex-end" → pullQuote 텍스트가 hero 높이 하단에 정렬. */}
      <View style={{ position: "absolute", left: 46, right: 46, bottom: 46, flexDirection: "row", gap: 22, alignItems: "flex-end" }}>
        <View style={{ width: 250, height: 155, overflow: "hidden" }}>
          <Image src={getChapterImage(2, variant)} style={{ width: 250, height: 155, objectFit: "cover" }} />
        </View>
        {pullQuote && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 19, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>
              {pullQuote}
            </Text>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, marginTop: 12 }}>by. {name}</Text>
          </View>
        )}
      </View>
    </Page>
  );
}

// ── Ch3 ──────────────────────────────────────────────────────────
// 시안 (2026-06-17): Vol. + 와인 룰 → 좌 타이틀 / 우 "CHAPTER 3." → 짧은
// 룰 → 부제 → 본문 → hero → 큰 따옴표 pullQuote 순서.
//   - 타이틀 행: alignItems flex-end 로 큰 타이틀과 작은 라벨이 baseline 동선
//   - 본문 ↔ hero 사이 wrap={false} 분리, hero ↔ pullQuote 도 통째 유지
//   - pullQuote 좌·우 따옴표는 페이지 양 끝 가까이 큼직하게 (시안의 큰 ", ")
function Chapter3MainPage({ name, body, pullQuote, sub, variant }: { name: string; body: string; pullQuote: string | null; sub: string; variant: ImageVariant }) {
  return (
    // Page 에 padding 직접 부여 — wrap 페이지 헤더 간격 일관 (paddingTop 71).
    <Page size="A4" wrap style={{ paddingHorizontal: 46, paddingTop: 71, paddingBottom: 50 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* fixed header — absolute(top 20): 모든 페이지 동일 위치, flow 공간 X. */}
      <View fixed style={{ position: "absolute", top: 20, left: 46, right: 46 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
        </View>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 12 }} />
      </View>

      {/* Title 행 — #1 marginTop 0 (Page paddingTop 가 갭 담당). 좌 큰 타이틀 / 우 작은 라벨, 상단 정렬.
          타이틀↔룰·룰↔부제 간격 20 통일. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT }}>
          {KOR_TITLE[3]}
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>
          CHAPTER 3.
        </Text>
      </View>
      <View style={{ marginTop: 20, width: 80, height: 1, backgroundColor: RULE }} />

      {/* 부제 (LLM headline / 비면 SUBTITLE[3] fallback) */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT, marginTop: 20 }}>
        {sub || SUBTITLE[3]}
      </Text>

      {/* Body 1-col flow — 길면 다음 페이지로 */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 16 }}>
        {body}
      </Text>

      {/* 하단 hero + pullQuote 묶음 — 페이지 bottom 46 anchor.
          - hero: 풀폭 X (width 503 유지), left 0, height 175, pullQuote 위 24 gap (marginBottom 24)
          - pullQuote: 컨테이너 안에서 좌·우 46 padding */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 46 }}>
        <View style={{ width: 403, height: 155, overflow: "hidden", marginBottom: 24 }}>
          <Image src={getChapterImage(3, variant)} style={{ width: 403, height: 155, objectFit: "cover" }} />
        </View>

        {pullQuote && (
          <View style={{ marginLeft: 46, marginRight: 46, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginRight: 14, marginTop: -10 }}>
              &#x201C;
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Noto Serif KR",
                  fontSize: 19,
                  fontWeight: 700,
                  color: TEXT,
                  textAlign: "left",
                  lineHeight: 1.6,
                }}
              >
                {pullQuote}
              </Text>
            </View>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginLeft: 14, marginBottom: -16 }}>
              &#x201D;
            </Text>
          </View>
        )}
      </View>
    </Page>
  );
}

// ── Ch4 ─────────────────────────────────────────────────────────
// 시안 (2026-06-17): 헤더 텍스트 우측 + 와인 룰 → 좌 (CHAPTER 4. /
// 큰 타이틀 / 짧은 룰) + 우 hero → 부제 → 본문.
// 기존 요소 그대로 두고 좌·우 위치만 시안에 맞춰 swap.
function Chapter4Page({ name, body, sub, variant }: { name: string; body: string; sub: string; variant: ImageVariant }) {
  return (
    // Page 에 padding 직접 부여 — wrap 페이지 헤더 간격 일관 (paddingTop 71).
    <Page size="A4" wrap style={{ paddingHorizontal: 46, paddingTop: 71, paddingBottom: 50 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* fixed header — absolute(top 20): 모든 페이지 동일 위치, flow 공간 X. */}
      <View fixed style={{ position: "absolute", top: 20, left: 46, right: 46 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
        </View>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 12 }} />
      </View>

      {/* 좌 타이틀 블록 / 우 hero — #1 marginTop 0 (Page paddingTop 가 갭 담당). 좌·우 swap.
          alignItems: "flex-end" → 타이틀 블록을 hero 하단에 맞춰 정렬.
          타이틀↔룰 간격 20 통일. 한글 타이틀은 "\n" 으로 2 줄 유지. */}
      <View wrap={false} style={{ flexDirection: "row", gap: 24, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 4.</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 8, lineHeight: 1.3 }}>
            {"내일로 향하는\n한 걸음"}
          </Text>
          <View style={{ marginTop: 20, width: 80, height: 1, backgroundColor: RULE }} />
        </View>
        {/* Chapter 4.jpg 세로형 (ratio 0.67). 시안보다 작았어서 키우고,
            우측 pad 0 — marginRight -46 으로 paddingHorizontal 보정해 페이지 우측 끝까지. */}
        <View style={{ width: 220, height: 328, overflow: "hidden", marginRight: -46 }}>
          <Image src={getChapterImage(4, variant)} style={{ width: 220, height: 328, objectFit: "cover" }} />
        </View>
      </View>

      {/* 부제 — 룰↔부제 간격 20 통일 */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT, marginTop: 20 }}>
        {sub || SUBTITLE[4]}
      </Text>

      {/* Body 1-col flow */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 16 }}>
        {body}
      </Text>
    </Page>
  );
}

/** 페이지 하단 중앙 pullQuote — 좌·우 큰 따옴표 액센트. */
function PullQuoteCenter({ text }: { text: string }) {
  return (
    <View style={{ position: "absolute", bottom: 56, left: 46, right: 46, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginRight: 14, marginTop: -10 }}>&#x201C;</Text>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, textAlign: "center", lineHeight: 1.6 }}>{text}</Text>
      </View>
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginLeft: 14, marginBottom: -16 }}>&#x201D;</Text>
    </View>
  );
}

export function Chapter({ chapter, headline, body, pullQuote, name, variant }: Props) {
  // '', **, () 같은 마크다운/특수기호가 LLM 본문에 섞여 들어오는 케이스 제거.
  const cleanBody = clampBodyToCompleteSentence(sanitizeBody(body));
  const cleanPull = pullQuote ? sanitizeBody(pullQuote) : null;
  // sub = LLM 이 생성한 챕터 headline. TOC 의 sub 와 동일 값.
  // headline 이 비면 SUBTITLE 상수가 fallback (각 챕터 page 내부).
  const sub = headline?.trim() || "";
  if (chapter === 1) return <Chapter1Page name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} variant={variant} />;
  if (chapter === 2) return <Chapter2Page name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} variant={variant} />;
  if (chapter === 3) {
    // 기존 deep page (별도 페이지) 를 main 으로 흡수 — pullQuote 가 본문 뒤 인라인으로 렌더.
    return <Chapter3MainPage name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} variant={variant} />;
  }
  return <Chapter4Page name={name} body={cleanBody} sub={sub} variant={variant} />;
}
