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

export function EditorIntro({ body, name }: Props) {
  return (
    <Page size={[PAGE_W, PAGE_H]} style={{ padding: 0, position: "relative", width: PAGE_W, height: PAGE_H, fontFamily: "Noto Serif KR", color: TEXT }}>
      {/* paper bg */}
      <Image
        src={PAPER}
        style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H }}
      />

      {/* 상단 마스트헤드 — Vol. {name} 좌 + magazine STORY 우 */}
      <Text style={{ position: "absolute", top: 20, left: PAD, fontSize: 12, color: TEXT }}>
        Vol. {name}
      </Text>
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

      {/* 본문 — 페이지 폭 사용 (좌우 PAD). bottom 만 anchor (사진 상단 24pt 위).
          사진 top = 842 - 46(bottom) - 260(height) = 536 → 컨테이너 bottom = 330 (= 842 - 512).
          top 제약 없음 → 본문 길이만큼 위로 자라남. */}
      <View
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          bottom: 330,
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

      {/* 하단 사진 — intro(1).jpg */}
      <View
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          bottom: 46,
          height: 260,
          overflow: "hidden",
        }}
      >
        <Image
          src="/intro(1).jpg"
          style={{ width: PAGE_W - PAD * 2, height: 260, objectFit: "cover" }}
        />
      </View>
    </Page>
  );
}
