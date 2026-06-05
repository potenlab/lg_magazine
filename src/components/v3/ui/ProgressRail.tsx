"use client";

import type { Chapter } from "@/lib/v3/scenes/types";

const CHAPTER_LABEL: Record<string, string> = {
  "0": "Chapter 0. VISION EXPRESS 탑승을 환영합니다",
  "1": "Chapter 1. 내가 지나온 길",
  "2": "Chapter 2. 나는 누구인가",
  "3": "Chapter 3. 내가 그리는 미래",
  "4": "Chapter 4. 내일로 향하는 한 걸음",
  C: "Closing",
};

const TOTAL_CHAPTERS = 4;

export function ProgressRail({ progress, chapter }: { progress: number; chapter: Chapter }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const label = CHAPTER_LABEL[String(chapter)] ?? "";
  // 채워진 별 = 챕터 숫자 그대로 (Ch1→1, Ch2→2, Ch3→3, Ch4→4). Ch0(intro)→0,
  // 'C'(Closing)→4. ChapterCardScene 의 중앙 별 표시와 동일 공식.
  const step =
    chapter === "C" ? TOTAL_CHAPTERS : typeof chapter === "number" ? Math.max(0, chapter) : 0;
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-16"
        style={{
          background: "linear-gradient(to top, rgba(10,6,3,0.72) 0%, rgba(10,6,3,0.34) 56%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[15] px-4 pb-2 pt-5 md:px-6">
        <div className="flex items-baseline justify-between text-[16px] tracking-[0.04em]">
          <span
            style={{
              fontFamily: "var(--font-ridi-batang)",
              color: "#e9d5a8",
              fontSize: "12px",
            }}
          >
            {label}
          </span>
          <span className="flex items-center gap-[6px]" aria-label={`step ${step} of ${TOTAL_CHAPTERS}`}>
            {Array.from({ length: TOTAL_CHAPTERS }).map((_, i) => {
              const filled = i < step;
              return (
                <span
                  key={i}
                  style={{
                    fontSize: "13px",
                    lineHeight: 1,
                    color: filled ? "#f4d58c" : "rgba(244, 213, 140, 0.28)",
                    textShadow: filled ? "0 0 6px rgba(244, 213, 140, 0.5)" : "none",
                    transition: "color 400ms ease",
                  }}
                >
                  ✦
                </span>
              );
            })}
          </span>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#d4a54a] to-[#f4d58c] transition-all"
            style={{ width: `${clamped * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}
