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
  // Only entries that actually have content — empty answer fields are skipped
  // (mirrors the admin page's `entry.text?.trim()` filter).
  const entries = thread.entries.filter((e) => e.text && e.text.trim().length > 0);

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
        className="relative flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf] p-7 shadow-2xl"
        style={{ fontFamily: "var(--font-ridi-batang)" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#9b8768]">
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
          <p className="text-[14px] italic text-[#8b7050]">아직 이 챕터의 답변이 없어요.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <div
                key={i}
                className="rounded-md border border-[#b99b6b]/30 bg-white/45 px-4 py-3"
              >
                <p className="text-[12px] tracking-wide text-[#8b7050]">{entry.label}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.7] text-[#3d2414]">
                  {entry.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
