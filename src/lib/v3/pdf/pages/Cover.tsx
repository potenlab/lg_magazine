import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * 표지 — cover.jpg 풀-블리드 + 동적 텍스트 오버레이.
 *
 *   모든 콘텐츠를 outer View(flexGrow:1, width:595) 안에 absolute 로 박는다.
 *   이전 패턴(`<Page>` 직속 children) 에서 react-pdf 가 Image bg 를 inline 으로
 *   잡아 Text 를 다음 페이지로 밀어내는 회귀가 났음 — 이 wrapper 가 핵심.
 *
 *   동적 슬롯 (시안 좌표 참고용 임시 텍스트 포함):
 *     - 상단 우측: VOL. {name} + "오직 한 사람을 위한 / 단 한 호의 매거진"
 *     - 하단 좌측: - {headline} -
 *     - 하단 우측: {date}, "비매품"
 *
 *   좌표는 A4 (595 × 842pt) 기준.
 */

interface Props {
  name: string;
  date: string;
  headline: string;
}

const CREAM = "#FFFDF2";

function formatDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, ".");
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

        {/* 1·5 ("오직 한 사람을 위한 / 단 한 호의 매거진", "비매품" 박스) 는
            cover.jpg 자체에 베이크돼 있어 오버레이 안 함.
            동적으로 박는 슬롯은 2·3·4 만 — VOL.{name} / -{headline}- / {date}. */}

        {/* VOL. {name} — "오직 한 사람을 위한 단 한 호의 매거진" 베이크 텍스트
            바로 아래 줄에 위치. */}
        {/* 이름 길이에 따라 좌측으로 밀리지 않도록 left-anchor 로 고정.
            "오직 한 사람을 위한" 베이크 텍스트 왼쪽 끝에 맞춰 자람. */}
        <Text
          style={{
            position: "absolute",
            top: 200,
            left: 385,
            fontSize: 22,
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
            bottom: 24,
            left: 46,
            fontSize: 14,
            fontFamily: "Noto Serif KR",
            color: CREAM,
          }}
        >
          - {headline} -
        </Text>

        {/* 발행일 — 하단 와인 밴드 우측 (비매품 박스 좌측) */}
        <Text
          style={{
            position: "absolute",
            bottom: 24,
            right: 100,
            fontSize: 14,
            fontFamily: "Noto Serif KR",
            color: CREAM,
          }}
        >
          {formatDate(date)}
        </Text>
      </View>
    </Page>
  );
}
