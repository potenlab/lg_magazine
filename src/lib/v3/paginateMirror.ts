/**
 * Split an LLM reflection/mirror into dialog pages by paragraph (\n\n).
 *
 * Deep mode (?deep) produces a 3-paragraph editor sketch that is too dense to
 * read on one dialog page. Non-deep produces 1–2 short paragraphs that should
 * stay together. So: 3+ paragraphs → split into 2 pages at the midpoint;
 * fewer → a single page (returned as the trimmed original).
 *
 * Shared by Ch1KeywordScene (공통점 미러), ValueReflectionScene (가치 미러),
 * and FollowupScene (중간요약) so deep-mode pagination stays consistent.
 */
export function paginateMirror(text: string): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length < 3) return [text.trim()];
  const mid = Math.ceil(paras.length / 2);
  return [paras.slice(0, mid).join("\n\n"), paras.slice(mid).join("\n\n")];
}
