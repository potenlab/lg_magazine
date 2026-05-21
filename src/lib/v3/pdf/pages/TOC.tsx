import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function TOC() {
  const items = [
    "From the Editor",
    "Chapter 1. 내가 지나온 길",
    "Chapter 2. 나는 누구인가",
    "Chapter 3. 내가 그리는 미래",
    "Chapter 4. 내일로 향하는 한 걸음",
    "Editor's Note",
  ];
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Contents</Text>
      <View style={{ marginTop: 12 }}>
        {items.map((label) => (
          <Text key={label} style={styles.tocItem}>
            {label}
          </Text>
        ))}
      </View>
      <Text
        style={styles.pageFooter}
        render={({ pageNumber }) => `${pageNumber}`}
        fixed
      />
    </Page>
  );
}
