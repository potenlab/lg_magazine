/**
 * 매거진 이미지 세트 — (1) / (2) 시리즈 중 하나를 다운로드 시점에 랜덤 선택.
 *
 * 세트 멤버:
 *   - EditorIntro 하단 이미지 — /intro(N).jpg
 *   - Chapter 2 hero            — /Chapter 2(N).jpg
 *   - Chapter 3 hero            — /Chapter 3(N).jpg
 *
 * (1)/(2) variant 가 없는 페이지 (Ch1·Ch4·Cover·EditorOutro·BackPage·paper)
 * 는 모든 세트에서 동일 자산 사용.
 */

export type ImageVariant = 1 | 2;

export function pickRandomVariant(): ImageVariant {
  return Math.random() < 0.5 ? 1 : 2;
}

export function getIntroImage(v: ImageVariant): string {
  return `/intro(${v}).jpg`;
}

export function getChapterImage(chapter: 1 | 2 | 3 | 4, v: ImageVariant): string {
  // Ch1 · Ch4 는 variant 미보유 — 단일 자산 사용.
  if (chapter === 1) return "/Chapter 1.jpg";
  if (chapter === 4) return "/Chapter 4.jpg";
  return `/Chapter ${chapter}(${v}).jpg`;
}
