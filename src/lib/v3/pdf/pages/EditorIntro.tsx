import { Image, Page, Text, View } from "@react-pdf/renderer";
import { sanitizeBody } from "../sanitize";
import { getIntroImage, type ImageVariant } from "../imageSets";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame, MAG_MARGIN, MAG_CONTENT_TOP } from "../MagazineFrame";

/**
 * Editor's Letter (2026 리디자인) — 인트로 문장이 짧아 2단 대신 전폭 단일 본문.
 *   하단 정렬(justifyContent flex-end): "Editor's Letter" 타이틀 → 전폭 본문 → hero 사진.
 *   색·폰트·프레임은 디자인 토큰/MagazineFrame 재사용.
 */
interface Props {
  body: string;
  name: string;
  variant: ImageVariant;
}

const KOR = MAG_FONT.kor;
const M = MAG_MARGIN;
const CONTENT_W = 595 - M * 2; // 535

export function EditorIntro({ body, name, variant }: Props) {
  // 인트로는 몇 문장 안 되므로 문장마다 줄바꿈 (문장 = 종결부호 단위).
  const perLine = sanitizeBody(body)
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");

  return (
    // 하단(bottom) 기준 정렬 — 본문이 길어져도 텍스트·이미지가 겹치지 않게
    // justifyContent flex-end 로 콘텐츠를 아래에서 위로 쌓는다.
    <Page
      size="A4"
      style={{
        backgroundColor: MAG.bg,
        fontFamily: KOR,
        color: MAG.text,
        paddingTop: MAG_CONTENT_TOP,
        paddingHorizontal: M,
        paddingBottom: 80, // hero 하단 ↔ 푸터 룰(bottom 50) 간격 30
        justifyContent: "flex-end",
      }}
    >
      <MagazineFrame name={name} />

      {/* 타이틀 — "Editor's" SemiBold + " Letter" Bold */}
      <Text style={{ fontFamily: KOR, fontSize: 26, color: MAG.text }}>
        <Text style={{ fontWeight: 600 }}>Editor&apos;s</Text>
        <Text style={{ fontWeight: 700 }}> Letter</Text>
      </Text>

      {/* 전폭 단일 본문 — 문장마다 줄바꿈 */}
      <Text style={{ fontFamily: KOR, fontSize: 14, lineHeight: 1.9, color: MAG.text, marginTop: 20 }}>
        {perLine}
      </Text>

      {/* 하단 hero 사진 */}
      <View style={{ width: CONTENT_W, height: 250, overflow: "hidden", marginTop: 40 }}>
        <Image src={getIntroImage(variant)} style={{ width: CONTENT_W, height: 250, objectFit: "cover" }} />
      </View>
    </Page>
  );
}
