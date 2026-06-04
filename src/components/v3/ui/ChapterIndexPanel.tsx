"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { buildV3ChapterThreads } from "@/lib/v3/session/adminView";
import { ChapterReviewOverlay } from "@/components/v3/ui/ChapterReviewOverlay";
import { useCornerHint } from "@/components/v3/context/CornerHintContext";
import type { Chapter } from "@/lib/v3/scenes/types";

/**
 * Toggle-able chapter record. A small "기록" button (top-left) opens a panel
 * listing chapters 0–4. Past + current chapters are clickable and open a
 * read-only Q&A review overlay; future chapters are dimmed and disabled.
 *
 * Review-only: nothing here mutates the session or navigates — closing the
 * panel/overlay returns the participant to the exact scene they were on. The
 * per-scene "이전" button (prevStack in V3App) is untouched and separate.
 */
export function ChapterIndexPanel({ currentChapter }: { currentChapter: Chapter }) {
  const { session } = useV3Session();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { hint } = useCornerHint();

  // buildV3ChapterThreads returns one thread per chapter, in order:
  // index 0 → Chapter 0, index 1 → Chapter 1, ... index 4 → Chapter 4.
  const threads = useMemo(() => buildV3ChapterThreads(session), [session]);

  // Closing ("C") means every numbered chapter is behind the participant.
  const currentChapterNum = currentChapter === "C" ? 5 : currentChapter;

  // Note: V3App keys this component on the current chapter, so when the
  // chapter changes the whole panel remounts fresh — `open`/`selectedIndex`
  // reset to their initial values automatically, no effect needed.

  return (
    <>
      {/* Toggle button — top-left, above the masthead. pointer-events-auto
          because ChapterHeader's wrapper is pointer-events-none. z-[57] keeps
          it tappable above the open panel (z-[55]) so it doubles as a close
          affordance. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`pointer-events-auto fixed left-4 top-4 z-[57] rounded-md border border-white bg-black/85 px-3 py-1.5 text-[16px] tracking-wide text-white backdrop-blur transition hover:bg-black ${hint === "record" ? "corner-hint-pulse" : ""}`}
        style={{ fontFamily: "var(--font-ridi-batang)" }}
        aria-label="챕터 기록"
      >
        기록
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Scrim — click to close the panel */}
            <motion.div
              className="fixed inset-0 z-[54] bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            {/* Slide-in panel from the left */}
            <motion.aside
              className="fixed left-0 top-0 z-[55] flex h-full w-[280px] flex-col gap-1 overflow-y-auto border-r border-[#d7bd83]/25 bg-[#1c120a]/95 px-4 pb-6 pt-[72px] backdrop-blur"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <p className="mb-3 px-2 text-[16px] font-semibold uppercase tracking-[0.22em] text-[#9b8768]">
                챕터 기록
              </p>
              {threads.map((thread, i) => {
                const isFuture = i > currentChapterNum;
                const isCurrent = i === currentChapterNum;
                return (
                  <button
                    key={thread.chapter}
                    type="button"
                    disabled={isFuture}
                    onClick={() => setSelectedIndex(i)}
                    className={`flex flex-col gap-0.5 rounded-md px-3 py-2.5 text-left transition ${
                      isFuture ? "cursor-default opacity-35" : "hover:bg-[#f6efdf]/10"
                    }`}
                  >
                    <span className="text-[16px] uppercase tracking-[0.16em] text-[#9b8768]">
                      {thread.chapter}
                      {isCurrent ? " · 진행 중" : ""}
                    </span>
                    <span className="text-[16px] text-[#e9d5a8]">{thread.title}</span>
                  </button>
                );
              })}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedIndex !== null && threads[selectedIndex] && (
          <ChapterReviewOverlay
            thread={threads[selectedIndex]}
            onClose={() => setSelectedIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
