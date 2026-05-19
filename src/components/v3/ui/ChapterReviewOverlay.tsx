"use client";

import { motion } from "framer-motion";
import type { ChapterThread } from "@/lib/v3/session/adminView";

/**
 * Read-only review of one chapter's question/answer digest. Rendered as a
 * full-screen overlay on top of the current scene — closing it returns the
 * participant to exactly where they were (no navigation, no data change).
 */
export function ChapterReviewOverlay({
  thread,
  onClose,
}: {
  thread: ChapterThread;
  onClose: () => void;
}) {
  // Filter strategy:
  // 1) Drop any entry with no text.
  // 2) Drop "question" entries whose following answer hasn't been answered yet,
  //    so questions don't appear before the participant has actually reached
  //    them.
  const rawEntries = thread.entries;
  const entries = rawEntries.filter((e, i) => {
    if (!e.text || e.text.trim().length === 0) return false;
    if (e.tone === "question") {
      const next = rawEntries[i + 1];
      const answered = next && next.text && next.text.trim().length > 0;
      if (!answered) return false;
    }
    return true;
  });

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        className="relative flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf] px-7 pb-7 pt-[76px] shadow-2xl"
        style={{ fontFamily: "var(--font-ridi-batang)" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[16px] font-semibold uppercase tracking-[0.22em] text-[#9b8768]">
              {thread.chapter}
            </p>
            <h3 className="mt-1 text-[18px] font-semibold text-[#3d2414]">{thread.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[24px] leading-none text-[#8b7050] transition hover:text-[#3d2414]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="text-[16px] italic text-[#8b7050]">아직 이 챕터의 답변이 없어요.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => {
              // tone-based styling — 질문/답변/AI 결과를 시각적으로 구별
              const isQuestion = entry.tone === "question";
              const isResult = entry.tone === "result";
              const boxClass = isQuestion
                ? "rounded-md border-l-[3px] border-[#b99b6b] bg-transparent px-4 py-2"
                : isResult
                ? "rounded-md border border-[#d7bd83]/40 bg-[#ede1c6]/40 px-4 py-3"
                : "rounded-md border border-[#b99b6b]/30 bg-white/55 px-4 py-3";
              const labelClass = isQuestion
                ? "text-[11px] uppercase tracking-[0.18em] text-[#9b8768]"
                : "text-[16px] tracking-wide text-[#8b7050]";
              const textClass = isQuestion
                ? "mt-1 whitespace-pre-wrap text-[16px] italic leading-[1.6] text-[#6b5337]"
                : "mt-1.5 whitespace-pre-wrap text-[16px] leading-[1.7] text-[#3d2414]";
              return (
                <div key={i} className={boxClass}>
                  <p className={labelClass}>{entry.label}</p>
                  <p className={textClass}>{entry.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
