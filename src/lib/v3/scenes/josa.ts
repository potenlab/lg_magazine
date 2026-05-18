/**
 * Pick the right Korean particle based on whether `word` ends in 받침.
 *
 * Pair format: `"<받침-있음>/<받침-없음>"` — e.g. `"이/가"`, `"을/를"`,
 * `"은/는"`, `"과/와"`, `"으로/로"` (ㄹ받침은 `로`), `"이라는/라는"`,
 * `"이었/였"`, `"이군요/군요"`.
 */
export function josa(word: string, pair: string): string {
  const [withFinal, withoutFinal] = pair.split("/");
  if (!word) return withFinal;

  const last = word[word.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return withFinal;
  }

  const finalIdx = (code - 0xac00) % 28;
  const hasFinal = finalIdx !== 0;
  const isRieul = finalIdx === 8;

  if (pair === "으로/로") {
    return hasFinal && !isRieul ? "으로" : "로";
  }
  return hasFinal ? withFinal : withoutFinal;
}
