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
