import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function TOC() {
  const items = [
    ["03", "From the Editor"],
    ["04", "Chapter 1. 내가 지나온 길"],
    ["05", "Chapter 2. 나는 누구인가"],
    ["06", "Chapter 3. 내가 그리는 미래"],
    ["07", "Chapter 4. 내일로 향하는 한 걸음"],
    ["08", "Editor's Note"],
  ];
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Contents</Text>
      <View style={{ marginTop: 12 }}>
        {items.map(([num, label]) => (
          <Text key={num} style={styles.tocItem}>
            {num}   {label}
          </Text>
        ))}
      </View>
      <Text style={styles.pageFooter}>2</Text>
    </Page>
  );
}
