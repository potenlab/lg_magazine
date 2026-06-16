import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * Editor Intro — 매거진 2번째 페이지.
 *
 *   좌측 세로 사이드바(rotated -90°):
 *     상단: "오직 한 사람을 위한 / 단 한 호의 매거진" (2줄, 큰 폰트)
 *     하단: "Vol. {name}"
 *   사이드바와 본문 사이 vertical rule.
 *   우측 본문: 본문 텍스트 + horizontal rule + /Introduction.jpg.
 *
 *   배경: /paper.jpg (Cover · BackPage 제외 모든 페이지 공통)
 *   좌표는 A4 (595 × 842pt) 기준.
 */

interface Props {
  body: string;
  name: string;
}

const TEXT = "#3d2414";
const MUTED = "#7a5a3a";
const RULE = "#59282E";
const PAPER = "/paper.jpg";

export function EditorIntro({ body, name }: Props) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
        {/* paper bg */}
        <Image
          src={PAPER}
          style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
        />

        {/* ── 좌측 사이드바 — 텍스트 통째로 -90° 회전.
            visual top-left 를 (left, top) 에 맞추려고 회전 전 box 위치를
            center-pivot 기준으로 보정 계산.
            box: width=W(텍스트 가로), height=H(글자 높이).
            회전 후 visual top-left = (left + W/2 - H/2, top + H/2 - W/2).
            원하는 visual = (사용자 좌표). */}

        {/* 상단: "오직 한 사람을 위한 단 한 호의 매거진"
            transformOrigin "left top" 으로 회전 → visual top-left 가
            (left - H, top) 이 되므로 left = 46 + 30 = 76, top = 46. */}
        <View
          style={{
            position: "absolute",
            top: 46,
            left: 76,
            width: 350,
            height: 30,
            transform: "rotate(-90deg)",
            transformOrigin: "left top",
          }}
        >
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 22, color: MUTED, letterSpacing: 2 }}>
            오직 한 사람을 위한 단 한 호의 매거진
          </Text>
        </View>

        {/* 하단: "Vol. {name}" → visual bottom-left at (46, 842-46=796).
            visual bottom-left = (left - H, top + W) at left-top origin.
            top + W = 796 ⟹ top = 796 - 150 = 646.
            left - H = 46 ⟹ left = 76. */}
        <View
          style={{
            position: "absolute",
            top: 646,
            left: 76,
            width: 150,
            height: 30,
            transform: "rotate(-90deg)",
            transformOrigin: "left top",
          }}
        >
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 22, color: MUTED, letterSpacing: 2 }}>
            Vol. {name}
          </Text>
        </View>

        {/* 사이드바와 본문 사이 세로 룰 — 시안 보면 사이드바 폭이 넓음 */}
        <View
          style={{
            position: "absolute",
            top: 60,
            bottom: 60,
            left: 330,
            width: 0.6,
            backgroundColor: RULE,
          }}
        />

        {/* ── 우측 본문 — 페이지 중간부터 ───────────────────────── */}
        <View
          style={{
            position: "absolute",
            top: 340,
            left: 350,
            right: 50,
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
          <View style={{ height: 0.6, backgroundColor: RULE, marginTop: 24 }} />
        </View>

        {/* ── 하단 사진 — Introduction.jpg ──────────────────────── */}
        <View
          style={{
            position: "absolute",
            left: 350,
            right: 50,
            bottom: 50,
            height: 320,
            overflow: "hidden",
          }}
        >
          <Image
            src="/Introduction.jpg"
            style={{ width: 195, height: 320, objectFit: "cover" }}
          />
        </View>
      </View>
    </Page>
  );
}
