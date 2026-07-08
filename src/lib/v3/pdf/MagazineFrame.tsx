import { Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "./styles";

/** 공통 좌우/상하 여백 (사방 30). 콘텐츠 페이지도 이 값에 맞춰 배치. */
export const MAG_MARGIN = 30;

/** 콘텐츠 시작 top — 헤더 룰(top 50)에서 30 아래. 모든 콘텐츠 페이지 paddingTop 공통. */
export const MAG_CONTENT_TOP = 80;

/**
 * MagazineFrame — 모든 콘텐츠 페이지 공통 프레임 (배경 제외).
 *   헤더: Vol.{name} 좌 / magazine STORY 우 + 가로 룰(top 50)
 *   푸터: 가로 룰(bottom 50) + 페이지번호(bottom 30, "현재/전체")
 *
 *   Page 안에 그대로 배치. 모든 요소 `fixed` — wrap(다중) 페이지에서도 매 페이지
 *   동일 위치에 반복된다. 색·폰트는 디자인 토큰(MAG / MAG_FONT) 참조.
 *
 *   ※ Cover / BackPage 등 풀블리드 특수 페이지에는 사용하지 않음.
 */
export function MagazineFrame({ name }: { name: string }) {
  const M = MAG_MARGIN;
  return (
    <>
      {/* 헤더 */}
      <Text
        fixed
        style={{ position: "absolute", top: 30, left: M, fontSize: 11, fontFamily: MAG_FONT.kor, fontWeight: 600, color: MAG.text }}
      >
        Vol. {name}
      </Text>
      <Text
        fixed
        style={{ position: "absolute", top: 30, right: M, fontSize: 13, fontFamily: MAG_FONT.eng, fontWeight: 700, color: MAG.text }}
      >
        magazine STORY
      </Text>
      <View fixed style={{ position: "absolute", top: 50, left: M, right: M, height: 1, backgroundColor: MAG.text }} />

      {/* 푸터 */}
      <View fixed style={{ position: "absolute", bottom: 50, left: M, right: M, height: 1, backgroundColor: MAG.text }} />
      <Text
        fixed
        style={{ position: "absolute", bottom: 20, left: M, right: M, textAlign: "center", fontSize: 11, fontFamily: MAG_FONT.kor, fontWeight: 600, color: MAG.text }}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </>
  );
}
