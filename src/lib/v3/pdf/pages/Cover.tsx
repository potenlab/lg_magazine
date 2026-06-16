import { Image, Page, Text } from "@react-pdf/renderer";

interface Props {
  name: string;
  date: string;
  headline: string;
}

const CREAM = "#f4d58c";

// 입력은 YYYY-MM-DD. 시안 표기는 점 구분 — "2026.06.01".
function formatDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, ".");
  return raw;
}

export function Cover({ name, date, headline }: Props) {
  return (
    <Page size="A4" style={{ padding: 0, position: "relative" }}>
      {/* cover.jpg 가 마스트헤드·서브타이틀·이미지·하단 와인 밴드까지 모두
          베이크된 풀 디자인. 동적 텍스트만 오버레이.
          좌표는 A4 (595 × 842pt) 기준. */}
      <Image
        src="/cover.jpg"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
      />

      {/* VOL. {name} — 상단 와인 밴드 우측 */}
      <Text
        style={{
          position: "absolute",
          top: 135,
          right: 46,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "Noto Serif KR",
          color: CREAM,
        }}
      >
        VOL. {name}
      </Text>

      {/* - {headline} - — 하단 와인 밴드 좌측 */}
      <Text
        style={{
          position: "absolute",
          bottom: 40,
          left: 46,
          fontSize: 16,
          fontFamily: "Noto Serif KR",
          color: CREAM,
        }}
      >
        - {headline} -
      </Text>

      {/* 발행일 — 하단 와인 밴드 우측 */}
      <Text
        style={{
          position: "absolute",
          bottom: 40,
          right: 46,
          fontSize: 16,
          fontFamily: "Noto Serif KR",
          color: CREAM,
        }}
      >
        {formatDate(date)}
      </Text>
    </Page>
  );
}
