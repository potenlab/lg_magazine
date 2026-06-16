import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * From the Editor — 매거진 2번째 페이지.
 * cream 양피지 + 좌측 세로 사이드바(rotated -90°) + 우측 본문 + 하단 이미지.
 * 좌표는 A4 (595 × 842pt) 기준.
 */

interface Props {
  body: string;
  name: string;
}

const TEXT = "#3d2414";
const MUTED = "#7a5a3a";
const RULE = "#b89e6c";
const PAPER = "/paper.jpg";

export function EditorIntro({ body, name }: Props) {
  return (
    <Page size="A4" wrap={false} style={{ padding: 0, position: "relative" }}>
      {/* paper bg — Cover/BackPage 외 모든 페이지 공통 */}
      <Image
        src={PAPER}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
      />
      {/* ── 좌측 사이드바 ─────────────────────────────────────────
          상단: "오직 한 사람을 위한 / 단 한 호의 매거진"
          하단: "Vol. {name}"
          모두 -90° 회전해 페이지 좌측을 세로로 가로지름. */}
      <View
        style={{
          position: "absolute",
          top: 70,
          left: 32,
          width: 24,
          height: 280,
          transform: "rotate(-90deg)",
          transformOrigin: "top left",
        }}
      >
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 11, color: MUTED, letterSpacing: 4 }}>
          오직 한 사람을 위한  단 한 호의 매거진
        </Text>
      </View>

      <View
        style={{
          position: "absolute",
          bottom: 70,
          left: 32,
          width: 24,
          height: 220,
          transform: "rotate(-90deg)",
          transformOrigin: "bottom left",
        }}
      >
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: MUTED, letterSpacing: 3 }}>
          Vol. {name}
        </Text>
      </View>

      {/* 사이드바와 본문 사이 세로 룰 */}
      <View
        style={{
          position: "absolute",
          top: 60,
          bottom: 60,
          left: 90,
          width: 0.6,
          backgroundColor: RULE,
        }}
      />

      {/* ── 본문 영역 ─────────────────────────────────────────── */}
      <View
        style={{
          position: "absolute",
          top: 280,
          left: 122,
          right: 60,
        }}
      >
        <Text
          style={{
            fontFamily: "Noto Serif KR",
            fontSize: 12,
            lineHeight: 1.9,
            color: TEXT,
          }}
        >
          {body}
        </Text>
        <View style={{ height: 0.6, backgroundColor: RULE, marginTop: 22 }} />
      </View>

      {/* ── 하단 이미지 — Introduction.jpg ───────────────────── */}
      <View
        style={{
          position: "absolute",
          left: 122,
          right: 60,
          bottom: 60,
          height: 230,
          overflow: "hidden",
        }}
      >
        <Image
          src="/Introduction.jpg"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </View>
    </Page>
  );
}
