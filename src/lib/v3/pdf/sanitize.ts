/**
 * PDF 본문에서 마크다운/특수기호 노출 제거.
 *   '', "", ‘’, “” (단·복 따옴표 전부)
 *   ** (마크다운 bold)
 *   ( ) (괄호)
 * LLM 출력에 섞여 들어오면 매거진 본문 미관 깨지므로 렌더 직전 일괄 제거.
 */
export function sanitizeBody(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/[''""''""`]/g, "")
    .replace(/[()]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
