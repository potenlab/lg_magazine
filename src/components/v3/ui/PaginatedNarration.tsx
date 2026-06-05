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
  onPageChange,
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
  /** Fires with the current page index on mount and on every page turn. */
  onPageChange?: (pageIndex: number) => void;
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
  // [2026-06-05] 800ms 는 길어서 "텍스트창 눌렀는데 안 넘어가는 구간이 있음"
  // 피드백의 주범이었음. 380ms 로 줄이고, dwell 중 클릭은 버퍼링했다가 dwell
  // 종료 즉시 자동 advance 하도록 변경 (buffered tap). 클릭이 silent-drop 되는
  // 케이스 자체를 없앰.
  const [canAdvance, setCanAdvance] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(false);
  const POST_SETTLE_DWELL_MS = 380;

  const isLastPage = page >= totalPages - 1;
  const pageLines = pages[page] ?? [];

  // Report the current page index (mount + every page turn) so a host can
  // react — e.g. the 0-5-2 hint scene pulsing the matching corner button.
  useEffect(() => {
    onPageChange?.(page);
  }, [page, onPageChange]);

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

  // 페이지가 바뀌면 이전 페이지에서 큐에 담아둔 advance 의도는 폐기.
  useEffect(() => {
    setPendingAdvance(false);
  }, [page]);

  // Tell parent when the current page has fully revealed, and start the
  // post-settle dwell timer. Reset the dwell flag whenever the page changes
  // or shown rewinds. setState calls are deferred via queueMicrotask to
  // satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (shown < pageLines.length || pageLines.length === 0) {
      queueMicrotask(() => setCanAdvance(false));
      return;
    }
    // Wait for fade-in + dwell before firing onSettled so the parent's
    // input/button doesn't appear while the last line is still animating.
    const t = setTimeout(() => {
      onSettled?.(isLastPage);
      setCanAdvance(true);
    }, POST_SETTLE_DWELL_MS);
    return () => clearTimeout(t);
  }, [shown, pageLines.length, isLastPage, onSettled, POST_SETTLE_DWELL_MS]);

  const doAdvance = () => {
    if (isLastPage) {
      onAdvance?.();
    } else {
      onPageEnd?.();
      setPage((p) => p + 1);
    }
  };

  const advancePage = () => {
    // Mid-reveal click: fast-forward the current page instead of advancing.
    // Prevents accidental scene skips when the user taps right as the last
    // line settles ("말 끝나지도 않았는데 화면 넘어가는" QA report).
    if (shown < pageLines.length) {
      setShown(pageLines.length);
      return;
    }
    // Post-settle dwell: 클릭을 silent-drop 하지 않고 큐에 담아둔다. dwell 이
    // 끝나는 효과(아래)에서 pendingAdvance 를 보고 즉시 진행 — "텍스트창
    // 눌렀는데 안 넘어가는" 회귀 방지.
    if (!canAdvance) {
      setPendingAdvance(true);
      return;
    }
    doAdvance();
  };

  // dwell 종료 시점에 큐가 있으면 즉시 진행.
  useEffect(() => {
    if (canAdvance && pendingAdvance) {
      setPendingAdvance(false);
      doAdvance();
    }
    // doAdvance 는 effect 마다 새로 생성되지만 동일 closure 안에서 한 번만
    // 호출되므로 deps 에 포함 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdvance, pendingAdvance]);

  // 마지막 줄이 화면에 떴으면 "다음" 힌트는 이미 보이도록 (dwell 중에도 0.45
  // 투명도로 노출). dwell 끝나면 1.0. 사용자에게 "여기 누르면 다음으로 가는
  // 곳" 어피던스를 더 일찍 주기 위함.
  const fullyShown = shown >= pageLines.length && pageLines.length > 0;
  const hintOpacity = canAdvance ? "opacity-100" : fullyShown ? "opacity-45" : "opacity-0";

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
        // `absolute bottom-6 left-6` baseline so the two sit at the same
        // height. Previously this used `mt-auto`, which got pushed UP
        // whenever a sibling (e.g. RitualScene's primary action button)
        // reserved space at the dialog bottom.
        <div className="absolute bottom-6 right-6 z-10 flex h-[44px] items-center text-[16px] text-[#8b7050]">
          <span
            className={`italic transition-opacity duration-300 ${hintOpacity}`}
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
