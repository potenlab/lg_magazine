import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";
import { getChapterImage, getChapter3Accent, type ImageVariant } from "../imageSets";
import { clampBodyToCompleteSentence, clampBodyKeepingEnding } from "../../llm/articleSanitize";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame } from "../MagazineFrame";
import { splitColsToFit, DropCapText, BodyText, QuoteBox, QUOTE_MARK } from "../magazineParts";

/**
 * Chapter 페이지 (2026 리디자인) — 챕터별 시안 레이아웃:
 *   Ch1: 좌(라벨·부제·드롭캡) / 우(hero + 와인 인용박스 + 본문)  — 나란한 2단
 *   Ch2: 상단 인용부(hero 우상단 + 여는/닫는 따옴표 + 인용문) → 라벨 → 2단 순수 본문
 *   Ch3: 라벨 → 2단 순수 본문 → 하단 밴드(이미지 좌 + 와인 인용박스 우)
 *   Ch4: Ch1 과 동일 골격이되 인용(pullQuote) 없음.
 *   색·폰트·프레임은 전부 디자인 토큰/MagazineFrame 재사용.
 */
interface Props {
  chapter: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  pullQuote: string | null;
  name: string;
  variant: ImageVariant;
}

const KOR = MAG_FONT.kor;

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

// Ch1/Ch4 나란한 2단 폭.
const LEFT_W = 265;
const RIGHT_W = 280;
// Ch2/Ch3 순수 2단 컬럼 좌표(시안 계측: 좌 x30 w255 / 우 x310 w255, 간격 25).
const COL_W = 255;
const COL_L = 30;
const COL_R = 310;
// 본문 하단 한계: 푸터 룰(y792 = bottom 50)에서 30 위 = 762. 좌단을 이 높이까지 채우고 넘치면 우단으로.
const BODY_BOTTOM = 762;

/** 챕터 라벨("Chapter N. 한글") + 부제 — 모든 챕터 공통. */
function Heading({ chapter, sub }: { chapter: 1 | 2 | 3 | 4; sub: string }) {
  return (
    <>
      <Text style={{ fontFamily: KOR, fontSize: 15, color: MAG.accent }}>
        Chapter {chapter}. {KOR_TITLE[chapter]}
      </Text>
      <Text style={{ fontFamily: KOR, fontSize: 26, fontWeight: 700, color: MAG.text, marginTop: 12, lineHeight: 1.35 }}>
        {sub}
      </Text>
    </>
  );
}

export function Chapter({ chapter, headline, body, pullQuote, name, variant }: Props) {
  const cleanBody =
    chapter === 4 ? clampBodyKeepingEnding(sanitizeBody(body)) : clampBodyToCompleteSentence(sanitizeBody(body));
  const cleanPull = chapter === 4 ? null : pullQuote ? sanitizeBody(pullQuote) : null;
  const sub = headline?.trim() || SUBTITLE[chapter];
  const hero = getChapterImage(chapter, variant);

  const pageStyle = { backgroundColor: MAG.bg, fontFamily: KOR, color: MAG.text } as const;

  // ── Ch2 ── 상단 풀폭 인용부 → 라벨 → 2단 순수 본문.
  if (chapter === 2) {
    // 본문 시작 y ≈ 컨테이너 258 + 헤딩(~67) + marginTop 40 = 365. 좌단을 762까지 채우고 넘치면 우단.
    const [leftBody, rightBody] = splitColsToFit(cleanBody, COL_W, BODY_BOTTOM - 365);
    return (
      <Page size="A4" style={pageStyle}>
        <MagazineFrame name={name} />
        {/* hero — 우상단 가로형(오른쪽 풀블리드). 폭 280 → 인용 카드(우단 x255)와 간격 60. */}
        <Image src={hero} style={{ position: "absolute", top: 80, right: 0, width: 280 }} />
        {/* 여는 따옴표(좌) */}
        <Text style={{ position: "absolute", top: 110, left: 200, fontFamily: KOR, fontWeight: 700, fontSize: 52, color: QUOTE_MARK }}>
          &#x201C;
        </Text>
        {/* 인용문 + By — 우측정렬 */}
        {cleanPull ? (
          <View style={{ position: "absolute", top: 130, right: 170, width: 225, backgroundColor: MAG.bg, paddingTop: 20, paddingRight: 20, paddingBottom: 30, paddingLeft: 30 }}>
            <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 16, lineHeight: 1.7, color: MAG.accent, textAlign: "right" }}>
              {cleanPull}
            </Text>
            <Text style={{ fontFamily: KOR, fontSize: 11, color: QUOTE_MARK, marginTop: 4, textAlign: "right" }}>
              By. {name}
            </Text>
          </View>
        ) : null}
        {/* 닫는 따옴표(우) */}
        <Text style={{ position: "absolute", top: 200, right: 120, fontFamily: KOR, fontWeight: 700, fontSize: 52, color: MAG.bg }}>
          &#x201D;
        </Text>
        {/* 라벨 + 부제 → (40 간격) → 2단 순수 본문 : 흐름 배치로 간격 고정(부제 줄 수 무관 항상 40) */}
        <View style={{ position: "absolute", top: 258, left: COL_L, width: 535 }}>
          <View style={{ width: 340 }}>
            <Heading chapter={chapter} sub={sub} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40 }}>
            <View style={{ width: COL_W }}>
              <DropCapText text={leftBody} />
            </View>
            {rightBody ? (
              <View style={{ width: COL_W }}>
                <BodyText text={rightBody} />
              </View>
            ) : null}
          </View>
        </View>
      </Page>
    );
  }

  // ── Ch3 ── 라벨 → (40) → 2단 순수 본문 → 하단 밴드(밤하늘 backdrop + 책상 이미지 좌 + 와인 인용박스 우).
  if (chapter === 3) {
    // 본문 시작 y ≈ 80 + 헤딩(~66) + marginTop 40 = 186. 좌단은 책상 이미지 top(≈622)까지 채움(우단은 박스가 아래 채움).
    const [leftBody, rightBody] = splitColsToFit(cleanBody, COL_W, 600 - 186);
    const deskImg = getChapter3Accent(); // 가로형 책상 장면(Chapter 3(1).jpg)
    // hero = getChapterImage(3) = 밤하늘(Chapter 3.jpg, 세로) — 하단 밴드 우측 backdrop
    return (
      <Page size="A4" style={pageStyle}>
        <MagazineFrame name={name} />
        {/* 라벨 + 부제 → (40 간격) → 2단 순수 본문 : 흐름 배치로 간격 고정 */}
        <View style={{ position: "absolute", top: 80, left: COL_L, width: 535 }}>
          <View style={{ width: 400 }}>
            <Heading chapter={chapter} sub={sub} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40 }}>
            <View style={{ width: COL_W }}>
              <DropCapText text={leftBody} />
            </View>
            {rightBody ? (
              <View style={{ width: COL_W }}>
                <BodyText text={rightBody} />
              </View>
            ) : null}
          </View>
        </View>
        {/* 하단 밴드: 밤하늘(우 backdrop) → 책상 이미지(좌) → 와인 인용박스(우) */}
        {/* 밤하늘: width 205 (좌단 595-205=390 → 책상 우단 380과 간격 10). 원본 비율 유지하되
            밴드 높이(262)로 크롭(overflow hidden) → 세로로 커지지 않아 본문과 안 겹침. */}
        <View style={{ position: "absolute", bottom: 60, right: 0, width: 205, height: 262, overflow: "hidden" }}>
          <Image src={hero} style={{ width: 205 }} />
        </View>
        <Image src={deskImg} style={{ position: "absolute", bottom: 60, left: 0, width: 380 }} />
        {cleanPull ? (
          // 크림 프레임 = 외곽 View(cream, padding 10) wrapper. border 대신 wrapper 라 아웃라인 깔끔.
          // 내부 인용박스 폭 250 = Ch1(RIGHT_W−30). padding·minHeight 등은 QuoteBox 기본값(Ch1 동일).
          <View style={{ position: "absolute", bottom: 90, right: 30, backgroundColor: MAG.bg, padding: 10 }}>
            <QuoteBox text={cleanPull} style={{ width: 250 }} />
          </View>
        ) : null}
      </Page>
    );
  }

  // ── Ch1 · Ch4 ── 좌(라벨·부제·드롭캡) / 우(hero + 인용박스 + 본문).
  // 본문 시작 y ≈ 좌단 top 80 + 헤딩(~67) + marginTop 40 = 185. 좌단을 762까지 채우고 넘치면 우단.
  const [leftBody, rightBody] = splitColsToFit(cleanBody, LEFT_W, BODY_BOTTOM - 185);
  return (
    <Page size="A4" style={pageStyle}>
      <MagazineFrame name={name} />

      {/* 우측 컬럼 — 절대 top 80 / right 0. hero 원본 비율(폭만 지정 → 높이 자동) +
          인용박스(이미지와 -30 겹침) + 본문 나머지.
          우단 본문은 오른쪽 페이지 끝에서 30pt 안쪽(marginRight 30) — hero/인용박스는 풀블리드 유지. */}
      <View style={{ position: "absolute", top: 80, right: 0, width: RIGHT_W }}>
        <Image src={hero} style={{ width: RIGHT_W }} />
        {cleanPull ? (
          <QuoteBox text={cleanPull} style={{ marginTop: -30, width: RIGHT_W - 30, alignSelf: "flex-end" }} />
        ) : null}
        {rightBody ? <BodyText text={rightBody} style={{ marginTop: 30, marginRight: 30 }} /> : null}
      </View>

      {/* 좌측 컬럼 — 절대 top 80 / left 30. 라벨 + 부제 + 드롭캡 본문. */}
      <View style={{ position: "absolute", top: 80, left: 30, width: LEFT_W }}>
        <Heading chapter={chapter} sub={sub} />
        <View style={{ marginTop: 40 }}>
          <DropCapText text={leftBody} />
        </View>
      </View>
    </Page>
  );
}
