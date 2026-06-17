import { Image, Page, Text, View } from "@react-pdf/renderer";
import { COLORS } from "../styles";

// 각 챕터의 라벨/한글 타이틀은 매거진 전반에 공통이고,
// sub 는 해당 챕터의 dynamic headline (Chapter.tsx 에 동일 값 전달됨) 을 그대로 사용.
const CHAPTER_META: { num: string; title: string }[] = [
  { num: "CHAPTER 1.", title: "내가 지나온 길" },
  { num: "CHAPTER 2.", title: "나는 누구인가" },
  { num: "CHAPTER 3.", title: "내가 그리는 미래" },
  { num: "CHAPTER 4.", title: "내일로 향하는 한 걸음" },
];

// Cover.tsx 패턴과 동일하게 — paper bg + 모든 콘텐츠 블록을 Page 직속 자식으로
// position:absolute 두면 react-pdf 가 추가 페이지를 만들지 않는다.
// View 래퍼를 두면 그 안의 자식이 flow 로 처리돼 두 번째 페이지가 생긴다.
const PAGE_W = 595;
const PAGE_H = 842;
const PAD = 46;
const RULE_TOP = 46;
const TITLE_TOP = 100;
const TITLE_FS = 56;
const TITLE_GAP = 60;
const CHAPTERS_TOP = TITLE_TOP + TITLE_FS + TITLE_GAP; // 216
// 챕터 사이 사이클 간격 (top 좌표 차이).
const CHAPTER_GAP = 110;

export function TOC({
  name: _name,
  chapterHeadlines,
}: {
  name: string;
  /** Chapter 1~4 의 dynamic headline. 인덱스 0 → Ch1. */
  chapterHeadlines: [string, string, string, string];
}) {
  return (
    <Page size={[PAGE_W, PAGE_H]} style={{ padding: 0, position: "relative", width: PAGE_W, height: PAGE_H, fontFamily: "Noto Serif KR", color: COLORS.text }}>
      {/* paper bg — EditorIntro 등 다른 페이지와 공통 */}
      <Image
        src="/paper.jpg"
        style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H }}
      />

      {/* 상단 마스트헤드 — 우측 magazine STORY 만 (좌측 Vol. {name} 제거) */}
      <Text style={{ position: "absolute", top: 20, right: PAD, fontSize: 12, color: COLORS.wine, letterSpacing: 0 }}>
        magazine <Text style={{ fontWeight: 700 }}>STORY</Text>
      </Text>
      <View
        style={{
          position: "absolute",
          top: RULE_TOP,
          left: PAD,
          right: PAD,
          height: 1,
          backgroundColor: COLORS.wine,
        }}
      />

      {/* Contents 타이틀 */}
      <Text
        style={{
          position: "absolute",
          top: TITLE_TOP,
          left: PAD,
          fontFamily: "Noto Serif KR",
          fontWeight: 700,
          fontSize: TITLE_FS,
          color: COLORS.wine,
          letterSpacing: 0,
        }}
      >
        Contents
      </Text>

      {/* 챕터 목록 */}
      {CHAPTER_META.map((c, i) => {
        const top = CHAPTERS_TOP + i * CHAPTER_GAP;
        return (
          <View key={c.num} style={{ position: "absolute", top, left: PAD, right: PAD }}>
            <Text style={{ fontSize: 14, color: COLORS.wine, letterSpacing: 0, marginBottom: 6 }}>
              {c.num}
            </Text>
            <Text
              style={{
                fontFamily: "Noto Serif KR",
                fontWeight: 700,
                fontSize: 18,
                color: COLORS.text,
                marginBottom: 6,
              }}
            >
              {c.title}
            </Text>
            <Text style={{ fontFamily: "Noto Serif KR", fontSize: 15, color: COLORS.muted }}>
              {chapterHeadlines[i]}
            </Text>
          </View>
        );
      })}

      {/* EDITOR'S NOTE */}
      <Text
        style={{
          position: "absolute",
          top: CHAPTERS_TOP + 4 * CHAPTER_GAP + 12,
          left: PAD,
          fontSize: 14,
          color: COLORS.wine,
          letterSpacing: 0,
        }}
      >
        EDITOR&apos;S NOTE
      </Text>
    </Page>
  );
}
