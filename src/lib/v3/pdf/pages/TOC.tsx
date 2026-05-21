import { Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

const SECTIONS = [
  "From the Editor",
  "Chapter 1. 내가 지나온 길",
  "Chapter 2. 나는 누구인가",
  "Chapter 3. 내가 그리는 미래",
  "Chapter 4. 내일로 향하는 한 걸음",
  "Editor's Note",
];

// 비-deep 매거진은 8페이지 고정이라 각 섹션 시작 페이지가 항상 같다 → 번호 표기.
// deep 모드는 챕터가 2페이지로 넘칠 수 있어 시작 페이지를 렌더 전에 알 수 없으므로
// 번호를 생략하고 섹션명만 나열한다.
const FIXED_PAGES = ["03", "04", "05", "06", "07", "08"];

export function TOC({ deep }: { deep: boolean }) {
  return (
    <Page size="A5" style={styles.page}>
      <Text style={styles.pageHeader}>Contents</Text>
      <View style={{ marginTop: 12 }}>
        {SECTIONS.map((label, i) => (
          <Text key={label} style={styles.tocItem}>
            {deep ? label : `${FIXED_PAGES[i]}   ${label}`}
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
