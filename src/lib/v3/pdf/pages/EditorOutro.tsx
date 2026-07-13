import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame, MAG_MARGIN, MAG_CONTENT_TOP } from "../MagazineFrame";

/**
 * Editor's Note (2026 리디자인) — 중앙 정렬: 타이틀 + hero(/outro.jpg) + 본문.
 *   색·폰트·프레임은 디자인 토큰/MagazineFrame 재사용.
 */
interface Props {
  body: string;
  name: string;
}

const KOR = MAG_FONT.kor;
const M = MAG_MARGIN;

export function EditorOutro({ body, name }: Props) {
  return (
    <Page
      size="A4"
      style={{ backgroundColor: MAG.bg, fontFamily: KOR, color: MAG.text, paddingTop: MAG_CONTENT_TOP, paddingHorizontal: M, paddingBottom: 70, alignItems: "center" }}
    >
      <MagazineFrame name={name} />

      {/* 타이틀 (중앙) */}
      <Text style={{ fontFamily: KOR, fontSize: 26, color: MAG.text, marginTop: 36, letterSpacing: 1 }}>
        <Text style={{ fontWeight: 600 }}>Editor&apos;s</Text>
        <Text style={{ fontWeight: 700 }}> Note</Text>
      </Text>

      {/* hero (중앙) */}
      <View style={{ width: 352, height: 231, overflow: "hidden", marginTop: 26 }}>
        <Image src="/outro.jpg" style={{ width: 352, height: 231, objectFit: "cover" }} />
      </View>

      {/* 본문 (중앙 정렬) */}
      <Text style={{ fontFamily: KOR, fontSize: 14, lineHeight: 1.9, color: MAG.text, textAlign: "center", marginTop: 40, width: 510 }}>
        {sanitizeBody(body)}
      </Text>
    </Page>
  );
}
