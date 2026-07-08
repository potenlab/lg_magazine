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

// 2026 리디자인: (1)/(2) 세트를 무시하고 슬롯당 단일 이미지 사용 (variant 미사용).
export function getIntroImage(_v: ImageVariant): string {
  return "/Editor's Letter(1).jpg";
}

export function getChapterImage(chapter: 1 | 2 | 3 | 4, _v: ImageVariant): string {
  if (chapter === 1) return "/Chapter 1.jpg";
  if (chapter === 2) return "/Chapter 2(1).jpg";
  if (chapter === 3) return "/Chapter 3.jpg"; // 고정 hero (Chapter 3(1).jpg 는 장식 액센트로 별도)
  return "/Chapter 4.jpg";
}

/** Chapter 3 의 두 번째(장식) 이미지 — 나중에 세트로 교체 예정. */
export function getChapter3Accent(): string {
  return "/Chapter 3(1).jpg";
}
