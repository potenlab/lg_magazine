import { Image, Page, Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "../styles";

/**
 * Back page (2026 리디자인) — 와인 풀블리드 + 중앙 "magazine STORY / VISION EXPRESS"
 * + 우하단 콜로폰. 텍스트는 크림, 배경은 포인트 와인(단색 — 시안의 그라디언트 근사).
 */
interface Props {
  name: string;
  date: string;
}

const KOR = MAG_FONT.kor;
const CREAM = MAG.bg;

const MONTHS = [
  "Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
  "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec.",
];
function formatDate(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]} ${MONTHS[parseInt(m[2], 10) - 1] ?? m[2]} ${m[1]}`;
  return raw;
}

export function BackPage({ name, date }: Props) {
  return (
    <Page size="A4" style={{ backgroundColor: MAG.accent, position: "relative", width: 595, height: 842 }}>
      {/* 중앙 로고 (magazine Logo.png — 1038×250, 비율 4.15) */}
      <View style={{ position: "absolute", top: 360, left: 0, right: 0, alignItems: "center" }}>
        <Image src="/magazine Logo.png" style={{ width: 260, height: 63 }} />
      </View>

      {/* 우하단 콜로폰 */}
      <View style={{ position: "absolute", bottom: 30, right: 30, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: KOR, fontSize: 16, color: CREAM, lineHeight: 1.9, textAlign: "right" }}>
          magazine STORY Vol. {name}
        </Text>
        <Text style={{ fontFamily: KOR, fontSize: 16, color: CREAM, lineHeight: 1.9, textAlign: "right" }}>인쇄부수 1부</Text>
        <Text style={{ fontFamily: KOR, fontSize: 16, color: CREAM, lineHeight: 1.9, textAlign: "right" }}>{formatDate(date)}</Text>
        <Text style={{ fontFamily: KOR, fontWeight: 600, fontSize: 16, color: CREAM, lineHeight: 1.9, textAlign: "right", marginTop: 16 }}>
          오직 한 사람을 위한 단 한 호의 매거진
        </Text>
        <Text style={{ fontFamily: KOR, fontWeight: 600, fontSize: 16, color: CREAM, lineHeight: 1.9, textAlign: "right" }}>
          — 매거진 STORY 편집부
        </Text>
      </View>
    </Page>
  );
}
