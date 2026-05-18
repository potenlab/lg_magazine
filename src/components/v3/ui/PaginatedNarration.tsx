"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EditorialInline, toEditorialBlocks } from "@/components/v3/ui/EditorialText";

const PER_LINE_DELAY_MS = 1200;
const FADE_DURATION_MS = 600;
const DEFAULT_PAGE_SIZE = 3;

/**
 * Manual-paged narration block.
 *
 * - Splits `lines` into pages of `pageSize` (default 2).
 * - Each page reveals its lines staggered (1.2s apart, 0.6s fade).
 * - Once a page has settled, the host calls `onSettled` so the parent
 *   scene can show its "click to continue" affordance.
 * - When the user clicks while on a non-last page, the page index advances
 *   (no scene change). On the last page, the parent's onClick takes over
 *   and advances the scene.
 *
 * The component intentionally renders only the *current* page so the dialog
 * box stays a fixed height — addresses QA "대화창 사이즈 고정 / 너무 길
 * 경우 다음 페이지로 나누기".
 */
export function PaginatedNarration({
  lines,
  pageSize = DEFAULT_PAGE_SIZE,
  onSettled,
  onPageEnd,
  onAdvance,
  tight = false,
}: {
  lines: string[];
  pageSize?: number;
  /** Fires once the current page's last line is visible. */
  onSettled?: (isLastPage: boolean) => void;
  /** Fires when the user clicks past a non-last page. Use this if you want to know about page turns. */
  onPageEnd?: () => void;
  /** Fires when the user clicks past the last page. */
  onAdvance?: () => void;
  /** When true, the component sizes to content (no flex-1 stretching) and
   * hides the bottom "다음 페이지" hint. Use when a sibling input/control
   * sits below the narration and we want them tight together. */
  tight?: boolean;
}) {
  const displayLines = useMemo(() => toEditorialBlocks(lines), [lines]);
  const pages: string[][] = [];
  for (let i = 0; i < displayLines.length; i += pageSize) {
    pages.push(displayLines.slice(i, i + pageSize));
  }
  const totalPages = pages.length || 1;

  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(0);
  // Post-settle dwell — after the last line of a page reveals (or the user
  // fast-forwards), block advance for a short beat so the fade-in finishes
  // and the line actually has a chance to be read. QA: "엘아울 멘트 다
  // 눌러야 다음으로 넘어갈 수 있게."
  const [canAdvance, setCanAdvance] = useState(false);
  const POST_SETTLE_DWELL_MS = FADE_DURATION_MS + 200; // 600 + 200 = 800ms

  const isLastPage = page >= totalPages - 1;
  const pageLines = pages[page] ?? [];

  // Stagger reveal of lines on the current page.
  // setState is deferred via queueMicrotask to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    queueMicrotask(() => setShown(0));
  }, [page]);

  useEffect(() => {
    if (shown >= pageLines.length) return;
    const t = setTimeout(
      () => setShown((s) => Math.min(s + 1, pageLines.length)),
      shown === 0 ? 100 : PER_LINE_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [shown, pageLines.length]);

  // Tell parent when the current page has fully revealed, and start the
  // post-settle dwell timer. Reset the dwell flag whenever the page changes
  // or shown rewinds. setState calls are deferred via queueMicrotask to
  // satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (shown < pageLines.length || pageLines.length === 0) {
      queueMicrotask(() => setCanAdvance(false));
      return;
    }
    onSettled?.(isLastPage);
    const t = setTimeout(() => setCanAdvance(true), POST_SETTLE_DWELL_MS);
    return () => clearTimeout(t);
  }, [shown, pageLines.length, isLastPage, onSettled, POST_SETTLE_DWELL_MS]);

  const advancePage = () => {
    // Mid-reveal click: fast-forward the current page instead of advancing.
    // Prevents accidental scene skips when the user taps right as the last
    // line settles ("말 끝나지도 않았는데 화면 넘어가는" QA report).
    if (shown < pageLines.length) {
      setShown(pageLines.length);
      return;
    }
    // Post-settle dwell: ignore clicks until the last line has had a beat
    // to fade in and be read. The user can still rapid-tap; they'll just
    // wait ~800ms after the final reveal before the next tap is honored.
    if (!canAdvance) return;
    if (isLastPage) {
      onAdvance?.();
    } else {
      onPageEnd?.();
      setPage((p) => p + 1);
    }
  };

  const settled = canAdvance;

  return (
    <div className={tight ? "flex flex-col" : "flex flex-1 flex-col"} onClick={advancePage}>
      <div
        className={
          tight
            ? "space-y-1 leading-[1.4] text-[#3d2414]"
            : "min-h-[140px] flex-1 space-y-1 leading-[1.4] text-[#3d2414]"
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-1"
          >
            {pageLines.slice(0, shown).map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: FADE_DURATION_MS / 1000, ease: "easeOut" }}
                className="whitespace-pre-line break-words"
                style={{ textWrap: "pretty" } as React.CSSProperties}
              >
                  <EditorialInline text={line} />
              </motion.p>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {!tight && (
        // Absolute-anchored to the dialog's bottom-right (positions itself
        // against the nearest positioned ancestor — i.e. the V3App dialog
        // motion.div which is `relative`). Matches the 이전 button's
        // `absolute bottom-7 left-7` baseline so the two sit at the same
        // height. Previously this used `mt-auto`, which got pushed UP
        // whenever a sibling (e.g. RitualScene's primary action button)
        // reserved space at the dialog bottom.
        <div className="absolute bottom-7 right-7 z-10 flex h-[44px] items-center text-[14px] text-[#8b7050]">
          <span
            className={`italic transition-opacity ${settled ? "opacity-100" : "opacity-0"}`}
          >
            {isLastPage
              ? onAdvance
                ? "다음"
                : ""
              : "다음"}
          </span>
        </div>
      )}
    </div>
  );
}
