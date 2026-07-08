import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";
import { getChapterImage, type ImageVariant } from "../imageSets";
import { clampBodyToCompleteSentence, clampBodyKeepingEnding } from "../../llm/articleSanitize";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame } from "../MagazineFrame";
import { splitCols, DropCapText, BodyText, QuoteBox } from "../magazineParts";

/**
 * Chapter 페이지 (2026 리디자인) — 시안 공통 레이아웃:
 *   라벨 "Chapter N. 한글타이틀"(와인) + 부제(큰 갈색) → 2단 본문
 *   좌단: 드롭캡 본문 / 우단: hero 이미지 + 와인 인용박스 + 본문 나머지
 *   Ch4 는 인용(pullQuote) 없음.
 *   색·폰트·프레임은 전부 디자인 토큰/MagazineFrame 재사용.
 *   ※ 각 챕터별 시안 미세차이(Ch2 상단 인용, Ch3 2번째 이미지 등)는 후속 조정.
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

// 좌측 컬럼(라벨·부제·드롭캡 본문) / 우측 컬럼(hero·인용박스·본문).
//   좌: left 30 ~ 295 (265폭) · 우: right 0, 280폭 (left 315) · 컬럼 간격 20.
const LEFT_W = 265;
const RIGHT_W = 280;

export function Chapter({ chapter, headline, body, pullQuote, name, variant }: Props) {
  const cleanBody =
    chapter === 4 ? clampBodyKeepingEnding(sanitizeBody(body)) : clampBodyToCompleteSentence(sanitizeBody(body));
  const cleanPull = chapter === 4 ? null : pullQuote ? sanitizeBody(pullQuote) : null;
  const sub = headline?.trim() || SUBTITLE[chapter];
  const [leftBody, rightBody] = splitCols(cleanBody);
  const hero = getChapterImage(chapter, variant);

  return (
    <Page size="A4" style={{ backgroundColor: MAG.bg, fontFamily: KOR, color: MAG.text }}>
      <MagazineFrame name={name} />

      {/* 우측 컬럼 — 절대 top 80 / right 0. hero 원본 비율(폭만 지정 → 높이 자동) +
          인용박스(이미지와 -30 겹침) + 본문 나머지. */}
      <View style={{ position: "absolute", top: 80, right: 0, width: RIGHT_W }}>
        <Image src={hero} style={{ width: RIGHT_W }} />
        {cleanPull ? (
          <QuoteBox text={cleanPull} by={name} style={{ marginTop: -30, width: RIGHT_W - 30, alignSelf: "flex-end" }} />
        ) : null}
        {rightBody ? <BodyText text={rightBody} style={{ marginTop: 16 }} /> : null}
      </View>

      {/* 좌측 컬럼 — 절대 top 80 / left 30. 라벨 + 부제 + 드롭캡 본문. */}
      <View style={{ position: "absolute", top: 80, left: 30, width: LEFT_W }}>
        <Text style={{ fontFamily: KOR, fontSize: 15, color: MAG.accent }}>
          Chapter {chapter}. {KOR_TITLE[chapter]}
        </Text>
        <Text style={{ fontFamily: KOR, fontSize: 26, fontWeight: 700, color: MAG.text, marginTop: 12, lineHeight: 1.35 }}>
          {sub}
        </Text>
        <View style={{ marginTop: 40 }}>
          <DropCapText text={leftBody} />
        </View>
      </View>
    </Page>
  );
}
