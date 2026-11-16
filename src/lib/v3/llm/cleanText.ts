// Removes stray characters a model sometimes drops into Korean text, e.g. the
// lone "Ƭ" seen once in the 10 Nov live re-test. Only blocks that never belong
// in these replies are removed: Latin Extended-A/B, IPA, spacing modifiers,
// combining marks, Greek, Cyrillic, private-use, the replacement character and
// control characters other than tab/newline. Hangul, Hanja, ASCII, Latin-1
// (é, ·) and Korean punctuation (‘’“”…—「」) are kept untouched.
const STRAY = "\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u0100-\\u052F\\uE000-\\uF8FF\\uFFFD";

// A stray char between two spaces becomes one space; glued to a word, it just
// disappears ("중Ƭ간" → "중간", "문장 Ƭ 중간" → "문장 중간").
const STRAY_RUN = new RegExp(`([ \\t]?)[${STRAY}]+([ \\t]?)`, "g");

export function cleanText(s: string): string {
  return s.replace(STRAY_RUN, (_m, before: string, after: string) => (before && after ? " " : before || after));
}

/** cleanText applied to every string inside an LLM result (objects, arrays). */
export function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return cleanText(value) as T;
  if (Array.isArray(value)) return value.map((v) => cleanDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = cleanDeep(v);
    return out as T;
  }
  return value;
}
