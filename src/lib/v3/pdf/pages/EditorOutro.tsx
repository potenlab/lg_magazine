import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

interface Props {
  body: string;
  name: string;
  date: string;
}

export function EditorOutro({ body, name, date }: Props) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Editor&apos;s Note</Text>
      <View style={{ marginTop: 8 }}>
        <Text style={styles.body}>{body}</Text>
      </View>
      <View style={styles.colophon}>
        <Text>Magazine STORY</Text>
        <Text>Vol. {name}</Text>
        <Text>발행일 {date}  ·  인쇄부수 1부</Text>
        <Text>오직 한 사람을 위해 만들어진 특집호.</Text>
        <Text>— 매거진 STORY 편집부</Text>
      </View>
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
