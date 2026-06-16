import { Image, Page, Text, View } from "@react-pdf/renderer";
import { COLORS } from "../styles";

const CHAPTERS = [
  { num: "CHAPTER 1.", title: "내가 지나온 길", sub: "숫자로 증명받는 순간들" },
  { num: "CHAPTER 2.", title: "나는 누구인가", sub: "삶의 항로를 직접 그리는 사람" },
  { num: "CHAPTER 3.", title: "내가 그리는 미래", sub: "살아있음을 느끼는 지도" },
  { num: "CHAPTER 4.", title: "내일로 향하는 한 걸음", sub: "매일, 한 줄씩 항로를 긋는다" },
];

export function TOC({ deep: _deep }: { deep: boolean }) {
  return (
    <Page size="A4" wrap={false} style={{ padding: 0, position: "relative", color: COLORS.text, fontFamily: "Noto Serif KR" }}>
      {/* paper bg */}
      <Image
        src="/paper.jpg"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
      />
      <View style={{ padding: 46 }}>
      {/* 상단: magazine STORY + 구분선 */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Text style={{ fontSize: 10, color: COLORS.wine, letterSpacing: 0.3 }}>
          magazine <Text style={{ fontWeight: 700 }}>STORY</Text>
        </Text>
      </View>
      <View
        style={{
          marginTop: 6,
          height: 0.8,
          backgroundColor: COLORS.wine,
        }}
      />

      {/* Contents 타이틀 */}
      <Text
        style={{
          marginTop: 38,
          fontFamily: "Noto Serif KR",
          fontWeight: 700,
          fontSize: 56,
          color: COLORS.wine,
          letterSpacing: -1,
        }}
      >
        Contents
      </Text>

      {/* 챕터 목록 */}
      <View style={{ marginTop: 32 }}>
        {CHAPTERS.map((c) => (
          <View key={c.num} style={{ marginBottom: 22 }}>
            <Text
              style={{
                fontSize: 10,
                color: COLORS.wine,
                letterSpacing: 1.2,
                marginBottom: 4,
              }}
            >
              {c.num}
            </Text>
            <Text
              style={{
                fontFamily: "Noto Serif KR",
                fontWeight: 700,
                fontSize: 18,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              {c.title}
            </Text>
            <Text style={{ fontSize: 10.5, color: COLORS.muted }}>
              {c.sub}
            </Text>
          </View>
        ))}

        <Text
          style={{
            marginTop: 6,
            fontSize: 10,
            color: COLORS.wine,
            letterSpacing: 1.2,
          }}
        >
          EDITOR&apos;S NOTE
        </Text>
      </View>
      </View>
    </Page>
  );
}
