import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * Editor's Note — 매거진 후반 한 페이지.
 *   상단: magazine STORY 우측 + 와인 룰
 *   상단부: /Editor's Note.jpg 대형 사진
 *   중단: "EDITOR'S NOTE" 큰 타이틀 + 짧은 룰
 *   하단: editor outro body 텍스트 (왼쪽 정렬, 줄간 1.7)
 *
 *   배경: /paper.jpg (Cover · BackPage 제외 모든 페이지 공통)
 *   좌표: A4 (595 × 842pt) 기준.
 */
interface Props {
  body: string;
  name: string;
}

const TEXT = "#3d2414";
const WINE = "#6b2a26";
const RULE = "#b89e6c";
const PAPER = "/paper.jpg";

export function EditorOutro({ body, name }: Props) {
  return (
    <Page size="A4" wrap={false} style={{ padding: 0, position: "relative" }}>
      {/* paper bg */}
      <Image
        src={PAPER}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
      />

      {/* 상단 헤더 — magazine STORY (우측) + 와인 룰 */}
      <View style={{ position: "absolute", top: 40, left: 46, right: 46, flexDirection: "row", justifyContent: "flex-end" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
      </View>
      <View style={{ position: "absolute", top: 64, left: 46, right: 46, height: 1, backgroundColor: WINE }} />

      {/* Editor's Note hero 사진 */}
      <View style={{ position: "absolute", top: 96, left: 46, right: 46, height: 380, overflow: "hidden" }}>
        <Image
          src="/Editor's Note.jpg"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </View>

      {/* "EDITOR'S NOTE" 큰 타이틀 + 룰 */}
      <View style={{ position: "absolute", top: 500, left: 46, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 34, fontWeight: 700, color: TEXT, letterSpacing: 1 }}>
          EDITOR&apos;S NOTE
        </Text>
        <View style={{ marginTop: 14, width: 110, height: 0.6, backgroundColor: RULE }} />
      </View>

      {/* Body */}
      <View style={{ position: "absolute", top: 580, left: 46, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT, lineHeight: 1.85 }}>
          {body}
        </Text>
      </View>

      {/* 발신자 — 본문 끝, 작게. */}
      <Text style={{ position: "absolute", bottom: 56, right: 46, fontFamily: "Noto Serif KR", fontSize: 10, color: WINE }}>
        Vol. {name}
      </Text>
    </Page>
  );
}
