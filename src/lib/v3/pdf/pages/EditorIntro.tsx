import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function EditorIntro({ body, pageNum }: { body: string; pageNum: number }) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>From the Editor</Text>
      <View style={{ marginTop: 8 }}>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Text style={styles.pageFooter}>{pageNum}</Text>
    </Page>
  );
}
