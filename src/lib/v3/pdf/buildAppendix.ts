import type { V3Session } from "@/lib/v3/scenes/types";
import { buildV3ChapterThreads } from "@/lib/v3/session/adminView";
import { sanitizeBody } from "./sanitize";
import type { AppendixThread, AppendixEntry, AppendixEntryTone } from "./pages/Appendix";

/**
 * 세션에서 PDF 별첨용 챕터 스레드 구성.
 * 공통 adminView.buildV3ChapterThreads 를 재사용 — 어드민/매거진 후면 spread
 * 와 같은 진실의 원천.
 *
 *   - text 비어있는 entry 는 제거
 *   - 질문(tone:"question") 만 있고 다음 답변이 비어있으면 그 질문도 제거 (빈 질문 노출 방지)
 *   - tone 미지정은 "answer" 로 fallback
 *   - 본문은 sanitize (마크다운/따옴표/괄호 제거)
 */
export function buildAppendixThreads(session: V3Session): AppendixThread[] {
  const raw = buildV3ChapterThreads(session);
  return raw
    .map((t) => {
      const filtered = t.entries.filter((e) => e.text && e.text.trim().length > 0);
      const cleaned: AppendixEntry[] = [];
      for (let i = 0; i < filtered.length; i += 1) {
        const e = filtered[i];
        const tone = e.tone ?? "answer";
        if (tone === "question") {
          const next = filtered[i + 1];
          const answered = next?.text && next.text.trim().length > 0;
          if (!answered) continue;
        }
        // followup 도 답변 톤으로 흡수 → AppendixEntryTone 으로 정규화.
        const t2: AppendixEntryTone =
          tone === "result" ? "result" : tone === "question" ? "question" : "answer";
        cleaned.push({
          label: e.label,
          tone: t2,
          text: sanitizeBody(e.text!),
        });
      }
      return { chapter: t.chapter, title: t.title, entries: cleaned };
    })
    .filter((t) => t.entries.length > 0);
}
