import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";

/**
 * Editor Intro — 매거진 2번째 페이지.
 * TOC 와 동일한 상단 마스트헤드 (Vol. {name} / magazine STORY + 와인 룰).
 * 본문은 페이지 폭을 사용해 좌우 PAD 들여쓰기.
 * 배경: /paper.jpg.
 */

interface Props {
  body: string;
  name: string;
}

const TEXT = "#3d2414";
const WINE = "#59282E";
const PAPER = "/paper.jpg";
const PAGE_W = 595;
const PAGE_H = 842;
const PAD = 46;

export function EditorIntro({ body, name: _name }: Props) {
  return (
    <Page size={[PAGE_W, PAGE_H]} style={{ padding: 0, position: "relative", width: PAGE_W, height: PAGE_H, fontFamily: "Noto Serif KR", color: TEXT }}>
      {/* paper bg */}
      <Image
        src={PAPER}
        style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H }}
      />

      {/* 상단 마스트헤드 — 우측 magazine STORY 만. (좌측 Vol. {name} 는 제거) */}
      <Text style={{ position: "absolute", top: 20, right: PAD, fontSize: 12, color: WINE, letterSpacing: 0 }}>
        magazine <Text style={{ fontWeight: 700 }}>STORY</Text>
      </Text>
      <View
        style={{
          position: "absolute",
          top: 46,
          left: PAD,
          right: PAD,
          height: 1,
          backgroundColor: WINE,
        }}
      />

      {/* 본문 — 페이지 폭 사용 (좌우 PAD) */}
      <View
        style={{
          position: "absolute",
          top: 120,
          left: PAD,
          right: PAD,
        }}
      >
        <Text
          style={{
            fontFamily: "Noto Serif KR",
            fontSize: 14,
            lineHeight: 1.9,
            color: TEXT,
          }}
        >
          {sanitizeBody(body)}
        </Text>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 24 }} />
      </View>

      {/* 하단 사진 — Introduction.jpg */}
      <View
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          bottom: 50,
          height: 320,
          overflow: "hidden",
        }}
      >
        <Image
          src="/intro(1).jpg"
          style={{ width: PAGE_W - PAD * 2, height: 320, objectFit: "cover" }}
        />
      </View>
    </Page>
  );
}
