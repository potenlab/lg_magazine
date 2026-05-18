import type { V3Session } from "./types";
import { josa } from "./josa";

const SYNTHETIC_RESOLVERS: Record<string, (s: V3Session) => string> = {
  // Strip trailing punctuation so when this gets spliced into a template
  // that already ends with `이군요.` / `다.`, we don't end up with a stray
  // mid-sentence period that the sentence splitter would later treat as a
  // boundary — sending "군요." onto its own page.
  topValueDef: (s) => (s.valueDefinitions[s.topValue] ?? "").replace(/[.!?。]+\s*$/u, "").trim(),
  selectedCount: (s) => String(s.selectedValues.length),
  // Ch4 recap — list all 3 picked values joined with " · " so the recap line
  // reflects the full set instead of an implicit first-pick "topValue".
  topValues: (s) => s.selectedValues.filter(Boolean).join(" · "),
  identityTitle: (s) => extractIdentityTitle(s.identityName),
  visionProgress: (s) => toProgressiveVision(s.visionLine),
  // Narration usage — keep the user's full text. Earlier this called
  // toAnchorSummary with tight char limits, but on long freetext that chops
  // mid-character with "..." which reads as "page broken". The narration
  // dialog (PaginatedNarration, pageSize:1, overflow-y-auto) wraps long lines
  // fine. MagazinePoster keeps its own toAnchorSummary calls since those
  // cards are fixed-size visuals where truncation is necessary.
  visionSummary: (s) => toNominalSummary(s.visionLine),
  firstStepSummary: (s) => toNominalSummary(s.firstStep),
  supportSummary: (s) => toNominalSummary(s.supportPerson),
  resourceSummary: (s) => toNominalSummary(s.neededResource),
  // Chapter 4 roadmap recap — the 1년/3년/언젠가 horizon lines with their
  // leading time marker stripped, so the narration can supply its own
  // "1년 안에는 …" framing without doubling the marker.
  timeHorizon1: (s) => stripHorizonPrefix(s.timeHorizon[0] ?? ""),
  timeHorizon2: (s) => stripHorizonPrefix(s.timeHorizon[1] ?? ""),
  timeHorizon3: (s) => stripHorizonPrefix(s.timeHorizon[2] ?? ""),
};

/**
 * Clean a user-entered string before splicing it into a narration template.
 * Participants sometimes type markdown-style emphasis (`**foo**`) expecting
 * it to render bold, and they often wrap their own answer in quotes — which
 * collides with the surrounding template quotes producing `""...""`.
 *
 * - Strip `**` and `__` (markdown bold markers — never rendered, just noise).
 * - Trim whitespace.
 * - Strip leading/trailing quote characters of any common shape so the
 *   template's own surrounding quotes aren't doubled.
 */
function sanitizeForTemplate(s: string): string {
  let out = s.replace(/\*\*/g, "").replace(/__/g, "");
  out = out.trim();
  out = out.replace(/^[\s"'`「」“”‘’]+/, "").replace(/[\s"'`「」“”‘’]+$/, "");
  return out;
}

/**
 * Strip the leading "1년 안에," / "3년 후에," / "언젠가," time marker (and any
 * trailing punctuation) from a timeHorizon sentence. The Chapter 4 roadmap
 * recap supplies its own "1년 안에는 …" framing, so the stored marker — which
 * v3GenerateTimeHorizon normalizes onto every line — would otherwise double up.
 */
function stripHorizonPrefix(s: string): string {
  return (s ?? "")
    .replace(/^\s*(?:1년\s*안에|3년\s*후에|언젠가)\s*[,，]?\s*/u, "")
    .replace(/[.!?。]+\s*$/u, "")
    .trim();
}

export function extractIdentityTitle(s: string): string {
  const cleaned = s
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .trim();
  const bracket = cleaned.match(/^\s*\[([^\]]+)\]/);
  if (bracket?.[1]) return bracket[1].trim();

  const firstLine = cleaned.split(/\r?\n/).find((line) => line.trim().length > 0) ?? cleaned;
  return firstLine
    .replace(/^[\s"'`「」“”‘’\[]+/, "")
    .replace(/[\s"'`「」“”‘’\].]+$/, "")
    .trim();
}

export function toProgressiveVision(s: string): string {
  const cleaned = sanitizeForTemplate(s)
    .replace(/\s*(?:입니다|이에요|예요|이다|합니다|해요)[.!?。]?$/u, "")
    .replace(/\s*싶(?:습니다|어요|다)?[.!?。]?$/u, "")
    .replace(/\s*(?:것입니다|겁니다|거예요|거에요)[.!?。]?$/u, "")
    .replace(/[.!?。]+$/u, "")
    .trim();

  if (!cleaned) return "";
  if (/(고|하며|하면서|며)$/.test(cleaned)) {
    return `${cleaned} 계시는`;
  }
  if (/(하는|되는|이루는|만드는|여는|증명하는|보여주는)$/.test(cleaned)) {
    return `${cleaned} 모습으로 계시는`;
  }
  return `${cleaned}을 향해 나아가고 계시는`;
}

export function toNominalSummary(s: string): string {
  return sanitizeForTemplate(s)
    .replace(/\s*(?:입니다|이에요|예요|이다|합니다|해요|할 거예요|할 겁니다|하겠습니다|하고 싶습니다|하고 싶어요)[.!?。]?$/u, "")
    .replace(/[.!?。]+$/u, "")
    .trim();
}

export function toAnchorSummary(s: string, maxLength = 36): string {
  const cleaned = toNominalSummary(s);
  const bracket = cleaned.match(/\[([^\]]{2,60})\]/u);
  if (bracket?.[1]) return bracket[1].trim();

  const quoted = [...cleaned.matchAll(/['"“”‘’]([^'"“”‘’]{2,36})['"“”‘’]/gu)].map((m) =>
    m[1].trim(),
  );
  if (quoted.length > 0 && cleaned.length > maxLength + 20) {
    return quoted[quoted.length - 1];
  }

  let first = cleaned.split(/[.!?。]\s*/u).find((part) => part.trim().length > 0) ?? cleaned;
  first = first
    .replace(/^(?:저의|제|나의)\s+/u, "")
    .replace(/\s*(?:이|가)?\s*(?:제|저의|나의)?\s*(?:가장\s*)?(?:큰\s*)?(?:우군|자원|도움|힘)(?:입니다|이에요|예요|이다)?$/u, "")
    .replace(/\s*(?:이|가|은|는)?\s*(?:필요합니다|필요해요|있으면 좋겠습니다|있다면 큰 도움이 될 것 같습니다).*$/u, "")
    .trim();

  if (first.length <= maxLength) return first;
  return `${first.slice(0, maxLength).trim()}...`;
}

function resolveKey(key: string, session: V3Session): string | null {
  if (key in SYNTHETIC_RESOLVERS) {
    return sanitizeForTemplate(SYNTHETIC_RESOLVERS[key](session));
  }
  if (key in session) {
    const v = (session as unknown as Record<string, unknown>)[key];
    if (typeof v !== "string") return null;
    // Numeric/system fields like `name`, `gender` shouldn't have quotes
    // stripped, but sanitizing them is harmless — they don't carry leading
    // quotes or markdown anyway. Apply uniformly for simplicity.
    return sanitizeForTemplate(v);
  }
  return null;
}

/**
 * Replace `{key}` with session value.
 * Replace `{j:key:이/가}` with the appropriate Korean particle for that key's value.
 *
 * Synthetic keys (computed from multiple fields):
 *   - `{topValueDef}` → `valueDefinitions[topValue]`
 *
 * Unknown placeholders pass through unchanged for visibility during dev.
 */
export function renderTemplate(text: string, session: V3Session): string {
  return text
    .replace(/\{j:(\w+):([^}]+)\}/g, (match, key: string, pair: string) => {
      const v = resolveKey(key, session);
      return v === null ? match : josa(v, pair);
    })
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      const v = resolveKey(key, session);
      return v === null ? match : v;
    });
}
