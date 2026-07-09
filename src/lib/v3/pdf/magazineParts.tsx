import { Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "./styles";

const KOR = MAG_FONT.kor;
export const QUOTE_MARK = "#A04C4C"; // 큰 따옴표 색

/**
 * 본문을 2단으로 분할 — 좌단을 더 길게(기본 62%). 우단은 hero + 인용박스가 위를
 * 차지하므로 텍스트가 짧아야 두 컬럼 높이가 균형을 이룬다.
 * 문단(\n\n) 우선 누적, 단일 문단이면 문장 단위 누적.
 */
/** 문단(\n\n)/문장 단위로 targetChars 까지 좌단에 채우고 나머지를 우단으로. */
function splitAtChars(body: string, targetChars: number): [string, string] {
  const t = (body || "").trim();
  if (!t) return ["", ""];
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
    if (acc >= targetChars) {
      i++;
      break;
    }
  }
  let right = units.slice(i);
  // 전부 좌단으로 갔으면 마지막 한 덩어리를 우단으로 넘긴다.
  if (right.length === 0 && left.length > 1) right = [left.pop() as string];
  return [left.join(joiner), right.join(joiner)];
}

export function splitCols(body: string, leftRatio = 0.62): [string, string] {
  return splitAtChars(body, (body || "").trim().length * leftRatio);
}

/**
 * 좌단 컬럼을 "높이"에 맞춰 채우고, 넘치는 분량만 우단으로 흘려보낸다.
 *   colWidthPt   — 좌단 폭
 *   leftHeightPt — 좌단 사용 가능 높이(본문 시작 y ~ 하단 한계 y)
 * **단어 단위**로 누적하며 추정 줄수(문단별 ceil 줄 + 문단 간격 1줄)가 컬럼 높이를 넘기 직전까지
 * 좌단에 담고 나머지를 우단으로. **문장 중간(단어 경계)에서도 분할** → 좌단을 한계까지 촘촘히 채워
 * "좌단만 짧고 우단만 긴" 불균형을 막는다(우단이 문장 도중부터 이어짐). 문단 경계는 보존.
 * 마지막 단어가 목표를 살짝 넘어도 되도록 +1줄 여유. 한글 14pt: 줄당 글자수 ≈ 폭/12.
 */
export function splitColsToFit(
  body: string,
  colWidthPt: number,
  leftHeightPt: number,
  fontSize = 14,
  lineHeight = 1.9,
): [string, string] {
  const t = (body || "").trim();
  if (!t) return ["", ""];
  const tokens: { w: string; pi: number }[] = [];
  t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).forEach((p, pi) => {
    p.split(/\s+/).filter(Boolean).forEach((w) => tokens.push({ w, pi }));
  });
  if (tokens.length < 2) return [t, ""];

  const charsPerLine = colWidthPt / 12; // MaruBuri 14pt 한글 본문 ≈ 줄당 폭/12 글자(실측)
  const maxLines = leftHeightPt / (fontSize * lineHeight) + 1;
  const estLines = (arr: { w: string; pi: number }[]) => {
    const chars: Record<number, number> = {};
    const count: Record<number, number> = {};
    arr.forEach((it) => {
      chars[it.pi] = (chars[it.pi] || 0) + it.w.length;
      count[it.pi] = (count[it.pi] || 0) + 1;
    });
    const pis = Object.keys(chars);
    // 문단별 (글자수 + 단어사이 공백수)/줄폭 올림 → 줄수, + 문단 간격
    return pis.reduce((n, pi) => n + Math.ceil((chars[+pi] + count[+pi] - 1) / charsPerLine), 0) + (pis.length - 1);
  };

  let cut = 1;
  for (let i = 1; i <= tokens.length; i++) {
    if (estLines(tokens.slice(0, i)) > maxLines) break;
    cut = i;
  }
  if (cut >= tokens.length) cut = tokens.length - 1; // 우단에 최소 한 단어

  const join = (arr: { w: string; pi: number }[]) =>
    arr.reduce((out, it, k) => (k === 0 ? it.w : out + (it.pi === arr[k - 1].pi ? " " : "\n\n") + it.w), "");
  return [join(tokens.slice(0, cut)), join(tokens.slice(cut))];
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

/** 와인 인용 박스 — 크림 글씨(좌측정렬) + 우상단 큰 따옴표(#A04C4C). */
export function QuoteBox({
  text,
  fontSize = 16,
  style,
}: {
  text: string;
  fontSize?: number;
  style?: object;
}) {
  return (
    <View style={{ position: "relative", backgroundColor: MAG.accent, minHeight: 180, justifyContent: "center", paddingTop: 20, paddingRight: 30, paddingBottom: 20, paddingLeft: 20, ...(style || {}) }}>
      <Text style={{ position: "absolute", top: 16, right: 16, fontFamily: KOR, fontWeight: 700, fontSize: 52, color: QUOTE_MARK }}>
        &#x201D;
      </Text>
      <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize, lineHeight: 1.7, color: MAG.bg, textAlign: "left" }}>{text}</Text>
    </View>
  );
}
