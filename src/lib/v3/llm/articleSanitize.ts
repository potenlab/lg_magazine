/** LLM chapter article 출력에서 raw markdown 마커(`**`, `[HEADLINE: ...]`,
 *  남은 `BODY:` / `PULL:` 라벨 등) 를 제거. 매거진/PDF 어디서든 같은 결과를
 *  보장하기 위해 export — 재호출/캐시 양쪽에서 재사용.
 *
 *  순수 함수 + Node 전용 의존성 없음 → client 컴포넌트(매거진 모달, PDF
 *  렌더) 와 server 측 prompts.ts 양쪽에서 안전하게 import 가능. */
export function cleanArticleField(s: string): string {
  return s
    // **bold** → bold (inner content 보존)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // 남은 `**` (짝 없거나 빈 강조) 제거
    .replace(/\*\*/g, "")
    // [HEADLINE: ...] 인라인 마커가 본문에 섞여 있는 케이스
    .replace(/\[HEADLINE:\s*[^\]]*\]/gi, "")
    // 본문 내부에 라벨이 그대로 박힌 케이스 — 라벨만 떼고 뒤는 보존
    .replace(/^\s*(?:HEADLINE|BODY|PULL)\s*:\s*/gim, "")
    .replace(/\n\s*(?:HEADLINE|BODY|PULL)\s*:\s*/gi, "\n")
    .trim();
}

/** 챕터 본문 최대 분량 (공백 포함, 대략값).
 *  웹 매거진은 본문 전체를 고정 높이 스프레드 칸에 그대로 렌더(자동 페이지
 *  분할 없음)하므로, 본문이 길면 칸을 넘쳐 마지막 문장이 시각적으로 잘린다.
 *  이 캡으로 칸 안에 들어오게 줄이고, 항상 완결 문장으로 끝맺도록 보장.
 *  Ch1~3 은 pullQuote 가 함께 들어가 본문 여유가 더 적고, Ch4 는 pullQuote 가
 *  없어 여유가 더 많지만 — 단순화를 위해 공통 캡 사용. */
export const CHAPTER_BODY_MAX_CHARS = 420;

/** 문장 종결 위치(마침표·물음표·느낌표 + 뒤따르는 닫는 따옴표/괄호)를 모두 찾아
 *  마지막 종결점의 끝 인덱스를 반환. 없으면 -1. */
function lastSentenceEnd(s: string): number {
  const re = /[.!?。][”’"'』」)\]]*/g;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    last = m.index + m[0].length;
  }
  return last;
}

/**
 * 본문이 (1) 최대 분량을 넘지 않고 (2) 반드시 완결된 문장으로 끝나도록 정리.
 *
 * - 캡 이내 + 이미 종결부호로 끝남 → 그대로.
 * - 캡 초과 → 캡 위치까지 자른 뒤, 그 안의 마지막 완결 문장까지만 남김.
 * - 캡 이내지만 종결부호 없이 끝남(잘린 조각) → 마지막 완결 문장까지만 남김.
 * - 문단 구분(\n\n)은 남은 범위 내에서 보존.
 *
 * 순수 함수 — client(매거진 모달·PDF) / server(prompts.ts) 양쪽 안전.
 */
export function clampBodyToCompleteSentence(
  body: string,
  maxChars: number = CHAPTER_BODY_MAX_CHARS,
): string {
  const t = (body || "").trim();
  if (!t) return t;
  const endsComplete = /[.!?。][”’"'』」)\]]*$/.test(t);
  if (t.length <= maxChars && endsComplete) return t;
  // 캡 초과면 캡 윈도우 안에서, 아니면 전체에서 마지막 완결 문장을 찾는다.
  const windowStr = t.length <= maxChars ? t : t.slice(0, maxChars);
  const cut = lastSentenceEnd(windowStr);
  if (cut > 0) return windowStr.slice(0, cut).trim();
  // 윈도우 안에 종결점이 전혀 없으면 전체에서 한 번 더 시도(보수적 fallback).
  const cutAll = lastSentenceEnd(t);
  if (cutAll > 0) return t.slice(0, cutAll).trim();
  return windowStr.trim();
}

/** Chapter 4 본문 최대 분량 — 공백 포함 430자(UI 영역 넘침 방지 상한). */
export const CHAPTER4_BODY_MAX_CHARS = 430;

/** Chapter 4 전용 — 분량 캡을 적용하되 고정 맺음말("…만들어갈 다음 호를 기대해
 *  보자.")은 항상 보존한다. 일반 clamp 는 꼬리를 잘라 맺음말까지 날리므로,
 *  초과 시에는 '맺음말 앞부분'만 문장 단위로 줄여 캡 안에 맞춘다.
 *  또한 맺음말은 길이와 무관하게 항상 새 문단(\n\n)으로 분리해 독립 문단으로 시작.
 *
 * 순수 함수 — client(PDF·매거진) / server(prompts.ts) 양쪽 안전. */
export function clampBodyKeepingEnding(
  body: string,
  maxChars: number = CHAPTER4_BODY_MAX_CHARS,
): string {
  const t = (body || "").trim();
  if (!t) return t;

  // 마지막 "…만들어갈 다음 호를 기대해 보자." 문장(맺음말)을 분리.
  const m = t.match(/[^.!?。\n]*만들어갈\s*다음\s*호를\s*기대해\s*보자\.\s*$/);
  if (!m || m.index === undefined) {
    // 맺음말이 없으면 길이만 캡(완결 문장).
    return t.length <= maxChars ? t : clampBodyToCompleteSentence(t, maxChars);
  }
  const ending = m[0].trim();
  let prefix = t.slice(0, m.index).trim();
  // 분량 초과면 prefix 를 (캡 − 맺음말 − 문단구분) 이내로 문장 단위 트림.
  const room = maxChars - ending.length - 2; // 2 ≈ "\n\n"
  if (room <= 0) prefix = "";
  else if (prefix.length > room) prefix = clampBodyToCompleteSentence(prefix, room);
  // 맺음말은 항상 새 문단(\n\n)으로 분리 — 줄바꿈해 독립 문단으로 시작.
  return prefix ? `${prefix}\n\n${ending}` : ending;
}
