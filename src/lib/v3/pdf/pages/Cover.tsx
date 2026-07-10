import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * 표지 — cover.jpg 풀-블리드(와인 배경 + magazine STORY + 기차 사진 + 목차 +
 * 바코드가 모두 베이크됨) + 동적 텍스트 오버레이 3개.
 *
 *   시안(1122×1587) → A4(595×842) 스케일 ×0.5303 로 좌표 변환.
 *   동적 슬롯 (베이크 이미지의 빈 자리):
 *     - 우상단        : {date}  (01 Jun. 2026 포맷)
 *     - STORY 오른쪽  : VOL. {name}
 *     - STORY 아래    : {headline}
 *
 *   폰트: MaruBuri (시안과 동일).
 */

interface Props {
  name: string;
  date: string;
  headline: string;
}

// orange-50 / orange-100 (시안의 크림 톤)
const CREAM = "#fbf6ed";
const CREAM_WARM = "#ffedd5";

const MONTHS = [
  "Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
  "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec.",
];

/** 2026-06-01 → "01 Jun. 2026" (시안 포맷). 형식이 다르면 원문 유지. */
function formatDate(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const mon = MONTHS[parseInt(m[2], 10) - 1] ?? m[2];
    return `${m[3]} ${mon} ${m[1]}`;
  }
  return raw;
}

export function Cover({ name, date, headline }: Props) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
        <Image
          src="/cover.jpg"
          style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
        />

        {/* 발행일 — 우상단 (시안 top 55 / right margin) */}
        <Text
          style={{
            position: "absolute",
            top: 28,
            right: 30,
            fontSize: 11,
            fontFamily: "MaruBuri",
            fontWeight: 600,
            color: CREAM,
            textAlign: "right",
          }}
        >
          {formatDate(date)}
        </Text>

        {/* VOL. {name} — STORY 오른쪽 (시안 left 854 / top 368) */}
        <Text
          style={{
            position: "absolute",
            top: 210,
            right: 30,
            fontSize: 22,
            fontFamily: "MaruBuri",
            fontWeight: 600,
            color: CREAM,
            textAlign: "right",
          }}
        >
          VOL. {name}
        </Text>

        {/* {headline} — STORY 아래 (시안 left 60 / top 465) */}
        <Text
          style={{
            position: "absolute",
            top: 250,
            left: 30,
            fontSize: 16,
            fontFamily: "MaruBuri",
            fontWeight: 400,
            color: CREAM_WARM,
          }}
        >
          {headline}
        </Text>
      </View>
    </Page>
  );
}
