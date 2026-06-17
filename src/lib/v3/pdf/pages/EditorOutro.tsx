import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";

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
const WINE = "#59282E";
const RULE = "#59282E";
const PAPER = "/paper.jpg";

export function EditorOutro({ body, name }: Props) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      {/* paper bg */}
      <Image
        src={PAPER}
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* 상단 헤더 — magazine STORY (우측) + 와인 룰 */}
      <View style={{ position: "absolute", top: 30, left: 46, right: 46, flexDirection: "row", justifyContent: "flex-end" }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
      </View>
      <View style={{ position: "absolute", top: 46, left: 46, right: 46, height: 1, backgroundColor: WINE }} />

      {/* Editor's Note hero 사진 */}
      <View style={{ position: "absolute", top: 96, left: 46, right: 46, height: 380, overflow: "hidden" }}>
        <Image
          src="/Editor's Note.jpg"
          style={{ width: 503, height: 380, objectFit: "cover" }}
        />
      </View>

      {/* "EDITOR'S NOTE" 큰 타이틀 + 룰 */}
      <View style={{ position: "absolute", top: 500, left: 46, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 28, fontWeight: 700, color: TEXT, letterSpacing: 1 }}>
          EDITOR&apos;S NOTE
        </Text>
        <View style={{ marginTop: 14, width: 110, height: 1, backgroundColor: RULE }} />
      </View>

      {/* Body */}
      <View style={{ position: "absolute", top: 580, left: 46, right: 46 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.85 }}>
          {sanitizeBody(body)}
        </Text>
      </View>

    </View>
    </Page>
  );
}
