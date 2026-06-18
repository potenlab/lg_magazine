import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";

/**
 * Editor's Note — 매거진 후반 페이지. 정체성 카드 내용을 노트에 통합.
 *   헤더: Vol.{name} 좌 + magazine STORY 우 + 와인 룰 (다른 챕터 페이지와 동일)
 *   hero: /outro.jpg
 *   라벨: EDITOR'S NOTE (작은 라벨)
 *   메인 타이틀: {title} = 정체성 타이틀 문장 (크게)
 *   짧은 룰
 *   본문: editor outro body
 *
 *   레이아웃·폰트·간격은 Chapter.tsx 와 동일 리듬:
 *     Page paddingTop 71 + absolute fixed 헤더 → wrap 페이지에도 헤더 간격 일관.
 *     hero(#1) marginTop 0 / 라벨↔타이틀 8 / 타이틀↔룰 20 / 룰↔본문 20 / 본문 lh 1.75.
 *   본문이 길면 자동으로 다음 페이지로 wrap.
 */
interface Props {
  body: string;
  name: string;
}

const TEXT = "#3d2414";
const WINE = "#59282E";
const RULE = "#59282E";
const PAPER = "/paper.jpg";

export function EditorOutro({ body, name }: Props) {
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

      {/* hero — #1 (flow). marginTop 0 (Page paddingTop 가 헤더 아래 갭 담당). */}
      <View style={{ height: 200, overflow: "hidden" }}>
        <Image src="/outro.jpg" style={{ width: 503, height: 200, objectFit: "cover" }} />
      </View>

      {/* 타이틀 EDITOR'S NOTE — hero 아래 24 (챕터 hero↔타이틀 간격). */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 28, fontWeight: 700, color: TEXT, letterSpacing: 1, marginTop: 24 }}>
        EDITOR&apos;S NOTE
      </Text>

      {/* 짧은 룰 — 타이틀 아래 20. */}
      <View style={{ height: 1, backgroundColor: RULE, marginTop: 20, width: 80 }} />

      {/* 본문 — 룰 아래 20, lh 1.75 (챕터 본문과 동일). 길면 wrap. */}
      <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.75, marginTop: 20 }}>
        {sanitizeBody(body)}
      </Text>
    </Page>
  );
}
