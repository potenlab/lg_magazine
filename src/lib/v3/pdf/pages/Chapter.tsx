import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

interface Props {
  chapter: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  pullQuote: string | null;
}

const KOR_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "내가 지나온 길",
  2: "나는 누구인가",
  3: "내가 그리는 미래",
  4: "내일로 향하는 한 걸음",
};

export function Chapter({ chapter, headline, body, pullQuote }: Props) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Chapter {chapter}</Text>
      <Text style={styles.chapterLabel}>{KOR_TITLE[chapter]}</Text>
      <Text style={styles.chapterHeadline}>{headline}</Text>
      <View>
        <Text style={styles.body}>{body}</Text>
      </View>
      {pullQuote && (
        <View style={styles.pullQuote}>
          <Text>&#x201C;{pullQuote}&#x201D;</Text>
        </View>
      )}
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
