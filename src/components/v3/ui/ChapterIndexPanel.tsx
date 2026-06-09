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
  const { session, patch } = useV3Session();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { hint } = useCornerHint();

  // buildV3ChapterThreads returns one thread per chapter, in order:
  // index 0 → Chapter 0, index 1 → Chapter 1, ... index 4 → Chapter 4.
  const threads = useMemo(() => buildV3ChapterThreads(session), [session]);

  // 이미 LLM 반향/요약이 생성된 답변 필드는 수정 차단 — 답만 바꾸면 결과지가
  // 어긋남. session 의 LLM 산출물 존재 여부로 lock 판정.
  const lockedFields = useMemo(() => {
    const locked = new Set<string>();
    const has = (v: unknown) => typeof v === "string" && v.trim().length > 0;
    // Ch1 두 몰입 경험 → ch1PoeticMirror 가 이미 만들어졌으면 잠금
    if (has(session.ch1PoeticMirror)) {
      locked.add("flowExperience1");
      locked.add("flowExperience2");
    }
    // strengthSynthesis (Ch2 매거진) 가 만들어졌으면 그 입력 전부 잠금
    if (has(session.strengthSynthesis)) {
      locked.add("flowExperience1");
      locked.add("flowExperience2");
      locked.add("commonPattern");
      locked.add("helpRequests");
      locked.add("othersDescription");
    }
    // growthVisionSynthesis(Ch3 매거진) 가 만들어졌으면 Ch3 입력 + identityName 잠금
    if (has(session.growthVisionSynthesis)) {
      locked.add("identityName");
      locked.add("attraction");
      locked.add("alreadyDoing");
      locked.add("obstacles");
      locked.add("whyReason");
      locked.add("growthDirection");
      locked.add("contribution");
    }
    // visionLine 도 identityName 을 참조 — 정체성 굳었으면 잠금
    if (has(session.visionLine)) {
      locked.add("identityName");
    }
    // Ch4(firstStep/supportPerson/neededResource)는 LLM 산출물 입력으로 안 쓰여서
    // 자동 잠금 대상이 아니지만, 사용자가 Closing 화면에 도달했다는 건 매거진이
    // 완성됐다는 뜻 → 다른 챕터와 일관되게 함께 잠근다. (피드백: "Ch4만 수정
    // 가능한 게 왜?" — 잠금 처리하는 게 더 자연스러움.)
    if (has(session.firstStep) || has(session.supportPerson) || has(session.neededResource)) {
      locked.add("firstStep");
      locked.add("supportPerson");
      locked.add("neededResource");
    }
    return locked;
  }, [session]);

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
        className={`pointer-events-auto fixed left-4 top-4 z-[57] rounded-md border-2 border-[#e9d5a8] bg-[#160d08] px-3.5 py-1.5 text-[16px] font-semibold tracking-wide text-[#e9d5a8] shadow-lg transition hover:bg-[#241710] ${hint === "record" ? "corner-hint-pulse" : ""}`}
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
              <p className="mb-3 px-2 text-[14px] font-semibold uppercase tracking-[0.1em] text-[#9b8768]">
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
                    <span className="text-[14px] uppercase tracking-[0.08em] text-[#9b8768]">
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
            onEdit={(fieldKey, next) => {
              patch({ [fieldKey]: next } as Partial<typeof session>);
            }}
            lockedFields={lockedFields}
          />
        )}
      </AnimatePresence>
    </>
  );
}
