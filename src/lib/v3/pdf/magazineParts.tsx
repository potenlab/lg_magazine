import { Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "./styles";

const KOR = MAG_FONT.kor;
const PINK = "#9d174d"; // 장식 따옴표 (pink-800)

/**
 * 본문을 2단으로 분할 — 좌단을 더 길게(기본 62%). 우단은 hero + 인용박스가 위를
 * 차지하므로 텍스트가 짧아야 두 컬럼 높이가 균형을 이룬다.
 * 문단(\n\n) 우선 누적, 단일 문단이면 문장 단위 누적.
 */
export function splitCols(body: string, leftRatio = 0.62): [string, string] {
  const t = (body || "").trim();
  if (!t) return ["", ""];
  const target = t.length * leftRatio;
  const units = t.includes("\n\n")
    ? t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : t.split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);
  const joiner = t.includes("\n\n") ? "\n\n" : " ";
  if (units.length < 2) return [t, ""];

  const left: string[] = [];
  let acc = 0;
  let i = 0;
  for (; i < units.length; i++) {
    left.push(units[i]);
    acc += units[i].length;
    if (acc >= target) {
      i++;
      break;
    }
  }
  let right = units.slice(i);
  // 전부 좌단으로 갔으면 마지막 한 덩어리를 우단으로 넘긴다.
  if (right.length === 0 && left.length > 1) right = [left.pop() as string];
  return [left.join(joiner), right.join(joiner)];
}

/** 드롭캡(첫 글자 크게) 본문 — 시안의 raised-cap 스타일. */
export function DropCapText({
  text,
  fontSize = 14,
  lineHeight = 1.9,
  dropCapSize,
}: {
  text: string;
  fontSize?: number;
  lineHeight?: number;
  dropCapSize?: number;
}) {
  const t = text || "";
  const first = t.slice(0, 1);
  const rest = t.slice(1);
  const dc = dropCapSize ?? fontSize + 4;
  return (
    <Text style={{ fontFamily: KOR, fontSize, lineHeight, color: MAG.text }}>
      <Text style={{ fontSize: dc, fontWeight: 600 }}>{first}</Text>
      {rest}
    </Text>
  );
}

/** 일반 본문 단락. */
export function BodyText({
  text,
  fontSize = 14,
  lineHeight = 1.9,
  style,
}: {
  text: string;
  fontSize?: number;
  lineHeight?: number;
  style?: object;
}) {
  return (
    <Text style={{ fontFamily: KOR, fontSize, lineHeight, color: MAG.text, ...(style || {}) }}>
      {text}
    </Text>
  );
}

/** 와인 인용 박스 — 크림 글씨 + 우상단 핑크 큰 따옴표. */
export function QuoteBox({
  text,
  by,
  fontSize = 15,
  style,
}: {
  text: string;
  by?: string;
  fontSize?: number;
  style?: object;
}) {
  return (
    <View style={{ position: "relative", backgroundColor: MAG.accent, paddingHorizontal: 18, paddingVertical: 16, ...(style || {}) }}>
      <Text style={{ position: "absolute", top: 2, right: 10, fontFamily: KOR, fontWeight: 700, fontSize: 44, color: PINK }}>
        &#x201D;
      </Text>
      <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize, lineHeight: 1.55, color: MAG.bg }}>{text}</Text>
      {by ? (
        <Text style={{ fontFamily: KOR, fontSize: 11, color: PINK, marginTop: 10 }}>by. {by}</Text>
      ) : null}
    </View>
  );
}
