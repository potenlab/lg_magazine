import { Fragment } from "react";
import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";

/**
 * Chapter pages — 챕터별 시안이 달라 단일 컴포넌트 안에서 chapter 번호에
 * 따라 4가지 레이아웃으로 분기. 모든 페이지는 /paper.jpg 를 풀-블리드
 * 배경으로 깔고 그 위에 hero image / 텍스트 오버레이.
 *
 *   Ch1: Vol. 헤더 + 상단 hero + 제목 좌·소제목 우 + body 2-col + bottom pullQuote
 *   Ch2: STORY 헤더 + 중앙 타이틀 + body 2-col + 중간 룰 + 좌하 hero + 우하 pullQuote
 *   Ch3: Vol. 헤더 + 중앙 타이틀 + body 2-col + 하단 hero (deep 일 때 + 페이지 2)
 *   Ch3 deep page 2: STORY 헤더 + 중앙 큰 pullQuote + 하단 hero (Chapter 3-2.jpg)
 *   Ch4: Vol. 헤더 + 좌상 hero + 우상 타이틀 + body 2-col
 *
 *   좌표는 A4 (595 × 842pt) 기준.
 */
interface Props {
  chapter: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  pullQuote: string | null;
  name: string;
  /** Ch3 일 때 두 번째 페이지(Chapter 3-2.jpg 풀쿼트 spread) 를 추가로 렌더 */
  deep?: boolean;
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
  2: "/Chapter 2.jpg",
  3: "/Chapter 3.jpg",
  4: "/Chapter 4.jpg",
};

/** 본문을 두 컬럼으로 균형 split. paragraph(\n\n) → 문장 → 글자 수 순서. */
function splitBodyIntoColumns(body: string): [string, string] {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return ["", ""];
  if (paragraphs.length === 1) {
    const sentences = paragraphs[0].split(/(?<=[.!?。])\s+/);
    if (sentences.length > 1) {
      const halfIdx = Math.ceil(sentences.length / 2);
      return [sentences.slice(0, halfIdx).join(" "), sentences.slice(halfIdx).join(" ")];
    }
    const halfChar = Math.ceil(paragraphs[0].length / 2);
    return [paragraphs[0].slice(0, halfChar), paragraphs[0].slice(halfChar)];
  }
  const total = paragraphs.reduce((s, p) => s + p.length, 0);
  let acc = 0;
  let idx = paragraphs.length;
  for (let i = 0; i < paragraphs.length; i++) {
    acc += paragraphs[i].length;
    if (acc >= total / 2) { idx = i + 1; break; }
  }
  return [paragraphs.slice(0, idx).join("\n\n"), paragraphs.slice(idx).join("\n\n")];
}

/** paper.jpg 풀-블리드 배경. 같은 element 인스턴스를 여러 Page 에 reuse 하면
 *  렌더가 어긋날 수 있어 컴포넌트 함수로 빼고 페이지마다 fresh element 로 박는다. */
function PaperBg() {
  return (
    <Image
      src={PAPER}
      style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
    />
  );
}

/** 상단 헤더 — variant "vol": 좌측 "Vol. {name}" / "story": 우측 "magazine STORY".
 *  둘 다 아래 wine 색 horizontal rule. */
function TopHeader({ name, variant }: { name: string; variant: "vol" | "story" }) {
  return (
    <Fragment>
      <View style={{ position: "absolute", top: 40, left: 46, right: 46, flexDirection: "row", justifyContent: variant === "vol" ? "flex-start" : "flex-end" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: variant === "vol" ? TEXT : WINE }}>
          {variant === "vol" ? `Vol. ${name}` : "magazine STORY"}
        </Text>
      </View>
      <View style={{ position: "absolute", top: 64, left: 46, right: 46, height: 1, backgroundColor: WINE }} />
    </Fragment>
  );
}


// ── Ch1 ─────────────────────────────────────────────────────────
// 1-col + Page wrap. 본문이 길면 자동으로 다음 페이지로 흘러감.
// paper.jpg + Vol.{name} 헤더는 `fixed` 로 모든 페이지에 반복.
// Hero / Title / Subtitle 은 첫 페이지 상단(flow), PullQuote 는 body 뒤 flow.
function Chapter1Page({ name, body, pullQuote }: { name: string; body: string; pullQuote: string | null }) {
  return (
    <Page size="A4" wrap style={{ padding: 0 }}>
      {/* paper bg — 모든 페이지 반복 */}
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      <View style={{ paddingHorizontal: 46, paddingTop: 40, paddingBottom: 50 }}>
        {/* Header — fixed: Vol. {name} + 와인 룰 (모든 페이지에) */}
        <View fixed>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <View style={{ height: 1, backgroundColor: WINE, marginTop: 18 }} />
        </View>

        {/* Hero — 첫 페이지에만 (flow) */}
        <View style={{ marginTop: 24, height: 260, overflow: "hidden", position: "relative" }}>
          <Image src={HERO[1]} style={{ width: 503, height: 260, objectFit: "cover" }} />
          <CornerAccent corner="tr" />
          <CornerAccent corner="bl" />
        </View>

        {/* Title row */}
        <View style={{ marginTop: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 30, fontWeight: 700, color: TEXT }}>{KOR_TITLE[1]}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 1.</Text>
            <View style={{ height: 1, backgroundColor: RULE, marginTop: 4, width: 110 }} />
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: RULE, marginTop: 6, width: 80 }} />

        {/* Subtitle */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, fontWeight: 700, marginTop: 22, color: TEXT }}>
          {SUBTITLE[1]}
        </Text>

        {/* Body 1-col — wrap 가능 (본문 길면 다음 페이지로) */}
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 11, lineHeight: 1.75, color: TEXT, marginTop: 18 }}>
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
function Chapter2Page({ name, body, pullQuote }: { name: string; body: string; pullQuote: string | null }) {
  const [leftCol, rightCol] = splitBodyIntoColumns(body);
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      <PaperBg />
      <TopHeader name={name} variant="story" />

      {/* 중앙 타이틀: CHAPTER 2. + 나는 누구인가 + 룰 (centered) */}
      <View style={{ position: "absolute", top: 100, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 2.</Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 30, fontWeight: 700, color: TEXT, marginTop: 8 }}>{KOR_TITLE[2]}</Text>
        <View style={{ marginTop: 12, width: 70, height: 1, backgroundColor: RULE }} />
      </View>

      {/* 부제 (centered) */}
      <View style={{ position: "absolute", top: 224, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 15, fontWeight: 700, color: TEXT }}>{SUBTITLE[2]}</Text>
      </View>

      {/* Body 2-col */}
      <View style={{ position: "absolute", top: 264, left: 46, right: 46, height: 280, flexDirection: "row", gap: 22, overflow: "hidden" }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{leftCol}</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{rightCol}</Text></View>
      </View>

      {/* 중간 가로 룰 */}
      <View style={{ position: "absolute", top: 568, left: 46, right: 46, height: 1, backgroundColor: RULE }} />

      {/* 좌하 hero (절반 폭) */}
      <View style={{ position: "absolute", top: 592, left: 46, width: 250, height: 200, overflow: "hidden" }}>
        <Image src={HERO[2]} style={{ width: 250, height: 200, objectFit: "cover" }} />
      </View>

      {/* 우하 pullQuote + by. {name} */}
      {pullQuote && (
        <View style={{ position: "absolute", top: 640, left: 320, right: 46 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 16, fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>
            {pullQuote}
          </Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, marginTop: 12 }}>by. {name}</Text>
        </View>
      )}
    </View>
    </Page>
  );
}

// ── Ch3 main ────────────────────────────────────────────────────
function Chapter3MainPage({ name, body }: { name: string; body: string }) {
  const [leftCol, rightCol] = splitBodyIntoColumns(body);
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      <PaperBg />
      <TopHeader name={name} variant="vol" />

      <View style={{ position: "absolute", top: 100, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 3.</Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 30, fontWeight: 700, color: TEXT, marginTop: 8 }}>{KOR_TITLE[3]}</Text>
        <View style={{ marginTop: 12, width: 70, height: 1, backgroundColor: RULE }} />
      </View>

      <View style={{ position: "absolute", top: 224, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 15, fontWeight: 700, color: TEXT }}>{SUBTITLE[3]}</Text>
      </View>

      {/* Body 2-col */}
      <View style={{ position: "absolute", top: 264, left: 46, right: 46, height: 290, flexDirection: "row", gap: 22, overflow: "hidden" }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{leftCol}</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{rightCol}</Text></View>
      </View>

      {/* 하단 hero full width */}
      <View style={{ position: "absolute", top: 580, left: 46, right: 46, height: 220, overflow: "hidden" }}>
        <Image src={HERO[3]} style={{ width: 503, height: 220, objectFit: "cover" }} />
      </View>
    </View>
    </Page>
  );
}

// ── Ch3 deep page 2 ────────────────────────────────────────────
function Chapter3DeepPage({ name, pullQuote }: { name: string; pullQuote: string }) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      <PaperBg />
      <TopHeader name={name} variant="story" />

      {/* 중앙 큰 pullQuote */}
      <View style={{ position: "absolute", top: 280, left: 46, right: 46, flexDirection: "row" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, color: MUTED, marginRight: 10, marginTop: -8 }}>&#x201C;</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 18, color: TEXT, lineHeight: 1.7 }}>{pullQuote}</Text>
        </View>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, color: MUTED, marginLeft: 10, marginBottom: -14 }}>&#x201D;</Text>
      </View>

      {/* 하단 가로 룰 */}
      <View style={{ position: "absolute", top: 416, left: 46, right: 46, height: 1, backgroundColor: RULE }} />

      {/* 하단 hero — Chapter 3-2.jpg */}
      <View style={{ position: "absolute", top: 444, left: 46, right: 46, bottom: 46, overflow: "hidden" }}>
        <Image src="/Chapter 3-2.jpg" style={{ width: 503, height: 352, objectFit: "cover" }} />
      </View>
    </View>
    </Page>
  );
}

// ── Ch4 ─────────────────────────────────────────────────────────
function Chapter4Page({ name, body }: { name: string; body: string }) {
  const [leftCol, rightCol] = splitBodyIntoColumns(body);
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      <PaperBg />
      <TopHeader name={name} variant="vol" />

      {/* 좌상 hero (절반 폭) */}
      <View style={{ position: "absolute", top: 96, left: 46, width: 290, height: 230, overflow: "hidden" }}>
        <Image src={HERO[4]} style={{ width: 290, height: 230, objectFit: "cover" }} />
      </View>

      {/* 우상 타이틀 블록 — hero(top:96~326) 세로 중앙(≈211) 에 맞춰 살짝 내림 */}
      <View style={{ position: "absolute", top: 180, left: 360, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>CHAPTER 4.</Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 28, fontWeight: 700, color: TEXT, marginTop: 10, lineHeight: 1.3 }}>
          {KOR_TITLE[4]}
        </Text>
        <View style={{ marginTop: 14, width: 110, height: 1, backgroundColor: RULE }} />
      </View>

      {/* 부제 (왼쪽 정렬, hero 아래) — hero 바닥(326) → 부제 사이 64pt 공백 */}
      <View style={{ position: "absolute", top: 390, left: 46, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 15, fontWeight: 700, color: TEXT }}>{SUBTITLE[4]}</Text>
      </View>

      {/* Body 2-col — 부제 → body 40pt 공백 */}
      <View style={{ position: "absolute", top: 440, left: 46, right: 46, bottom: 60, flexDirection: "row", gap: 22, overflow: "hidden" }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{leftCol}</Text></View>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: "Noto Serif KR", fontSize: 10.5, lineHeight: 1.6, color: TEXT }}>{rightCol}</Text></View>
      </View>
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

export function Chapter({ chapter, body, pullQuote, name, deep }: Props) {
  // '', **, () 같은 마크다운/특수기호가 LLM 본문에 섞여 들어오는 케이스 제거.
  const cleanBody = sanitizeBody(body);
  const cleanPull = pullQuote ? sanitizeBody(pullQuote) : null;
  if (chapter === 1) return <Chapter1Page name={name} body={cleanBody} pullQuote={cleanPull} />;
  if (chapter === 2) return <Chapter2Page name={name} body={cleanBody} pullQuote={cleanPull} />;
  if (chapter === 3) {
    if (deep && cleanPull) {
      return (
        <Fragment>
          <Chapter3MainPage name={name} body={cleanBody} />
          <Chapter3DeepPage name={name} pullQuote={cleanPull} />
        </Fragment>
      );
    }
    return <Chapter3MainPage name={name} body={cleanBody} />;
  }
  return <Chapter4Page name={name} body={cleanBody} />;
}
