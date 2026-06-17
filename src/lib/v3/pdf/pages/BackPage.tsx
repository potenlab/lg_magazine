import { Image, Page, Text, View } from "@react-pdf/renderer";

/**
 * Back page — 매거진 마지막 페이지.
 *   /back page.jpg 가 와인 색 풀-블리드 + 로고 + 기차 일러스트를 베이크해놓음.
 *   동적 텍스트는 하단 콜로폰(Magazine STORY / Vol. / 발행일 / 코멘트) 만 오버레이.
 *   좌표: A4 (595 × 842pt) 기준.
 */
interface Props {
  name: string;
  date: string;
}

const TEXT = "#3d2414";

function formatDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw;
}

export function BackPage({ name, date }: Props) {
  return (
    <Page size="A4" style={{ padding: 0 }}>
      <View style={{ position: "relative", flexGrow: 1, width: 595 }}>
      {/* back page.jpg — 와인 배경 + 로고 + 기차 + 하단 cream strip 까지 베이크. */}
      <Image
        src="/back page.jpg"
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* 하단 cream strip 위 콜로폰 텍스트.
          back page.jpg 하단 ~150pt 가 cream strip 으로 베이크됐다는 전제. */}
      <View style={{ position: "absolute", bottom: 110, left: 52, right: 52 }}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
          Magazine STORY
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
          Vol. {name}
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
          발행일 {formatDate(date)}  ·  인쇄부수 1부
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
          오직 한 사람을 위해 만들어진 특집호.
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 14, color: TEXT, lineHeight: 1.8 }}>
          — 매거진 STORY 편집부
        </Text>
      </View>
    </View>
    </Page>
  );
}
