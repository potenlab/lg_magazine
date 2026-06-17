import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";

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
const HERO: Record<1 | 2 | 3 | 4, string> = {
  1: "/Chapter 1.jpg",
  2: "/Chapter 2(1).jpg",
  3: "/Chapter 3(1).jpg",
  4: "/Chapter 4.jpg",
};

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
function Chapter1Page({ name, body, pullQuote, sub }: { name: string; body: string; pullQuote: string | null; sub: string }) {
  return (
    <Page size="A4" wrap style={{ padding: 0 }}>
      {/* paper bg — 모든 페이지 반복 */}
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      <View style={{ paddingHorizontal: 46, paddingTop: 20, paddingBottom: 50 }}>
        {/* Header — fixed: Vol. {name} + 와인 룰 (모든 페이지에) */}
        <View fixed>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <View style={{ height: 1, backgroundColor: WINE, marginTop: 4 }} />
        </View>

        {/* Hero — 첫 페이지에만 (flow) */}
        <View style={{ marginTop: 24, height: 157, overflow: "hidden", position: "relative" }}>
          <Image src={HERO[1]} style={{ width: 503, height: 157, objectFit: "cover" }} />
          <CornerAccent corner="tr" />
          <CornerAccent corner="bl" />
        </View>

        {/* Title row */}
        <View style={{ marginTop: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT }}>{KOR_TITLE[1]}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 1.</Text>
            <View style={{ height: 1, backgroundColor: RULE, marginTop: 4, width: 110 }} />
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: RULE, marginTop: 6, width: 80 }} />

        {/* Subtitle — dynamic headline (TOC sub 와 동일), 비면 static fallback */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, marginTop: 22, color: TEXT }}>
          {sub || SUBTITLE[1]}
        </Text>

        {/* Body 1-col — wrap 가능 (본문 길면 다음 페이지로) */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 18 }}>
          {body}
        </Text>

        {/* PullQuote — body 뒤 flow. wrap={false} 로 quote 자체는 한 페이지에 통째 유지. */}
        {pullQuote && (
          <View
            wrap={false}
            style={{ marginTop: 36, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 40, color: MUTED, marginRight: 14, marginTop: -10 }}>
              &#x201C;
            </Text>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, textAlign: "center", lineHeight: 1.6 }}>
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

// ── Ch2 ─────────────────────────────────────────────────────────
// Page wrap. 본문이 길면 자동으로 다음 페이지로 흐름.
// 헤더(paper bg + magazine STORY 룰)는 fixed 로 모든 페이지에 반복.
function Chapter2Page({ name, body, pullQuote, sub }: { name: string; body: string; pullQuote: string | null; sub: string }) {
  return (
    <Page size="A4" wrap style={{ padding: 0 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      <View style={{ paddingHorizontal: 46, paddingTop: 20, paddingBottom: 50 }}>
        {/* fixed header — 모든 페이지 반복 */}
        <View fixed style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
          <View style={{ height: 1, backgroundColor: WINE, marginTop: 4, alignSelf: "stretch" }} />
        </View>

        {/* 중앙 타이틀 */}
        <View style={{ alignItems: "center", marginTop: 36 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 2.</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 8 }}>{KOR_TITLE[2]}</Text>
          <View style={{ marginTop: 12, width: 70, height: 1, backgroundColor: RULE }} />
        </View>

        {/* 부제 */}
        <View style={{ alignItems: "center", marginTop: 28 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT }}>{sub || SUBTITLE[2]}</Text>
        </View>

        {/* Body — 1-col flow. 길면 다음 페이지로. */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 24 }}>
          {body}
        </Text>

        {/* 본문 ↔ 하단 블록 사이 가로 룰 */}
        <View style={{ height: 1, backgroundColor: RULE, marginTop: 28 }} />

        {/* 하단: 좌 hero + 우 pullQuote. wrap={false} 로 둘이 같은 페이지 유지. */}
        <View wrap={false} style={{ marginTop: 24, flexDirection: "row", gap: 22 }}>
          <View style={{ width: 250, height: 155, overflow: "hidden" }}>
            <Image src={HERO[2]} style={{ width: 250, height: 155, objectFit: "cover" }} />
          </View>
          {pullQuote && (
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Noto Serif KR", fontSize: 16, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>
                {pullQuote}
              </Text>
              <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, marginTop: 12 }}>by. {name}</Text>
            </View>
          )}
        </View>
      </View>
    </Page>
  );
}

// ── Ch3 (deep page 합쳐서 단일 페이지) ─────────────────────────────
// Page wrap. 본문이 길면 다음 페이지로 흐름.
// 기존 Chapter3DeepPage 의 pullQuote 블록을 본문 뒤 / hero 앞에 인라인으로 흡수.
function Chapter3MainPage({ name, body, pullQuote, sub }: { name: string; body: string; pullQuote: string | null; sub: string }) {
  return (
    <Page size="A4" wrap style={{ padding: 0 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      <View style={{ paddingHorizontal: 46, paddingTop: 20, paddingBottom: 50 }}>
        {/* fixed header */}
        <View fixed>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <View style={{ height: 1, backgroundColor: WINE, marginTop: 4 }} />
        </View>

        {/* 중앙 타이틀 */}
        <View style={{ alignItems: "center", marginTop: 36 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 3.</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 8 }}>{KOR_TITLE[3]}</Text>
          <View style={{ marginTop: 12, width: 70, height: 1, backgroundColor: RULE }} />
        </View>

        {/* 부제 */}
        <View style={{ alignItems: "center", marginTop: 28 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT }}>{sub || SUBTITLE[3]}</Text>
        </View>

        {/* Body 1-col flow */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 24 }}>
          {body}
        </Text>

        {/* PullQuote — 기존 deep page 의 큰 인용 (26pt 따옴표 / 18pt 본문).
            wrap={false} 로 한 페이지에 통째 유지. */}
        {pullQuote && (
          <View wrap={false} style={{ marginTop: 28, flexDirection: "row" }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, color: MUTED, marginRight: 10, marginTop: -8 }}>&#x201C;</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, color: TEXT, lineHeight: 1.7 }}>{pullQuote}</Text>
            </View>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, color: MUTED, marginLeft: 10, marginBottom: -14 }}>&#x201D;</Text>
          </View>
        )}

        {/* 하단 hero — wrap={false} 로 한 페이지에 통째로 */}
        <View wrap={false} style={{ marginTop: 28, height: 167, overflow: "hidden" }}>
          <Image src={HERO[3]} style={{ width: 503, height: 167, objectFit: "cover" }} />
        </View>
      </View>
    </Page>
  );
}

// ── Ch4 ─────────────────────────────────────────────────────────
// Page wrap. hero+title 블록은 wrap={false} 로 묶어 통째 유지,
// 그 아래 부제 + 1-col 본문이 자연 흐름. 본문 길면 다음 페이지로.
function Chapter4Page({ name, body, sub }: { name: string; body: string; sub: string }) {
  return (
    <Page size="A4" wrap style={{ padding: 0 }}>
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      <View style={{ paddingHorizontal: 46, paddingTop: 20, paddingBottom: 50 }}>
        {/* fixed header */}
        <View fixed>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <View style={{ height: 1, backgroundColor: WINE, marginTop: 4 }} />
        </View>

        {/* hero + title 행 — wrap={false} 로 페이지 중간에 잘리지 않게 */}
        <View wrap={false} style={{ marginTop: 24, flexDirection: "row", gap: 24, alignItems: "center" }}>
          <View style={{ width: 290, height: 230, overflow: "hidden" }}>
            <Image src={HERO[4]} style={{ width: 290, height: 230, objectFit: "cover" }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 4.</Text>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 10, lineHeight: 1.3 }}>
              {KOR_TITLE[4]}
            </Text>
            <View style={{ marginTop: 14, width: 110, height: 1, backgroundColor: RULE }} />
          </View>
        </View>

        {/* 부제 */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, fontWeight: 700, color: TEXT, marginTop: 40 }}>
          {sub || SUBTITLE[4]}
        </Text>

        {/* Body 1-col flow */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, lineHeight: 1.75, color: TEXT, marginTop: 24 }}>
          {body}
        </Text>
      </View>
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

export function Chapter({ chapter, headline, body, pullQuote, name }: Props) {
  // '', **, () 같은 마크다운/특수기호가 LLM 본문에 섞여 들어오는 케이스 제거.
  const cleanBody = sanitizeBody(body);
  const cleanPull = pullQuote ? sanitizeBody(pullQuote) : null;
  // sub = LLM 이 생성한 챕터 headline. TOC 의 sub 와 동일 값.
  // headline 이 비면 SUBTITLE 상수가 fallback (각 챕터 page 내부).
  const sub = headline?.trim() || "";
  if (chapter === 1) return <Chapter1Page name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} />;
  if (chapter === 2) return <Chapter2Page name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} />;
  if (chapter === 3) {
    // 기존 deep page (별도 페이지) 를 main 으로 흡수 — pullQuote 가 본문 뒤 인라인으로 렌더.
    return <Chapter3MainPage name={name} body={cleanBody} pullQuote={cleanPull} sub={sub} />;
  }
  return <Chapter4Page name={name} body={cleanBody} sub={sub} />;
}
