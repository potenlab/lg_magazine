/**
 * 매거진 이미지 세트 — (1) / (2) 시리즈 중 하나를 다운로드 시점에 랜덤 선택.
 *
 * 세트 멤버:
 *   - EditorIntro 하단 hero      — /Editor's Letter(N).jpg
 *   - Chapter 2 hero             — /Chapter 2(N).jpg
 *   - Chapter 3 하단 밴드 장식   — /Chapter 3(N).jpg (밤하늘 backdrop 인 Chapter 3.jpg 는 고정)
 *
 * (1)/(2) variant 가 없는 페이지 (Ch1·Ch4·Cover·EditorOutro·BackPage·paper)
 * 는 모든 세트에서 동일 자산 사용.
 */

export type ImageVariant = 1 | 2;

export function pickRandomVariant(): ImageVariant {
  return Math.random() < 0.5 ? 1 : 2;
}

export function getIntroImage(v: ImageVariant): string {
  return `/Editor's Letter(${v}).jpg`;
}

export function getChapterImage(chapter: 1 | 2 | 3 | 4, v: ImageVariant): string {
  if (chapter === 1) return "/Chapter 1.jpg";
  if (chapter === 2) return `/Chapter 2(${v}).jpg`;
  if (chapter === 3) return "/Chapter 3.jpg"; // 고정 hero (밤하늘 backdrop, 장식 액센트는 getChapter3Accent 참고)
  return "/Chapter 4.jpg";
}

/** Chapter 3 하단 밴드의 두 번째(장식/책상) 이미지 — (1)/(2) 세트. */
export function getChapter3Accent(v: ImageVariant): string {
  return `/Chapter 3(${v}).jpg`;
}
