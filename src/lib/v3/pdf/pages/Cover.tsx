import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

interface Props {
  name: string;
  date: string;
  headline: string;
}

export function Cover({ name, date, headline }: Props) {
  return (
    <Page size="A5" style={styles.page}>
      <View>
        <Text style={styles.coverTitle}>Magazine STORY</Text>
        <Text style={styles.coverMeta}>Vol. {name}</Text>
        <Text style={styles.coverMeta}>발행일 {date}</Text>
        <Text style={styles.coverHeadline}>{headline}</Text>
      </View>
      <Text style={styles.pageFooter}>오직 한 사람을 위한 단 한 호의 매거진</Text>
    </Page>
  );
}
