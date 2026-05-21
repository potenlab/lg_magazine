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

/** A running chunk longer than this starts a new visual paragraph at the
 *  next sentence boundary. Tuned for the wide reflection dialog box. */
const CHUNK_MAX_CHARS = 60;

/**
 * Split reflection text into readable visual paragraphs.
 *
 * Hard-breaks at the LLM's own paragraph marks (\n\n) first, then within each
 * paragraph groups sentences greedily: short sentences stay joined, and a new
 * chunk begins once the running chunk would exceed ~60 chars. A single long
 * sentence becomes its own chunk — sentences are never split mid-way.
 *
 * This keeps a one-paragraph deep reflection from rendering as a single dense
 * block while not over-fragmenting a few short sentences.
 */
export function splitReadableChunks(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const para of paragraphs) {
    // Split into sentences, keeping the terminal punctuation with each.
    const sentences = para
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    let cur = "";
    for (const s of sentences) {
      if (cur && cur.length + 1 + s.length > CHUNK_MAX_CHARS) {
        chunks.push(cur);
        cur = s;
      } else {
        cur = cur ? `${cur} ${s}` : s;
      }
    }
    if (cur) chunks.push(cur);
  }
  return chunks.length > 0 ? chunks : [text.trim()];
}
