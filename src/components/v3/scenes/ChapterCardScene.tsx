"use client";

import { motion } from "framer-motion";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

const CHAPTER_TITLE: Record<string, string> = {
  "1": "Chapter 1. 내가 지나온 길",
  "2": "Chapter 2. 나는 누구인가",
  "3": "Chapter 3. 내가 그리는 미래",
  "4": "Chapter 4. 내일로 향하는 한 걸음",
};

export function ChapterCardScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const title = CHAPTER_TITLE[String(spec.chapter)] ?? "";
  // ProgressRail(하단)의 채워진 별 개수와 동일 공식 사용 — step = chapter+1.
  // (이전엔 spec.chapter 그대로 써서 항상 1개씩 어긋났음.)
  const starCount =
    spec.chapter === "C"
      ? 5
      : typeof spec.chapter === "number"
        ? Math.max(1, spec.chapter + 1)
        : 1;
  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  return (
    <button
      type="button"
      onClick={advance}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6 text-center"
      aria-label={`${title} — 다음으로 진행`}
    >
      <motion.div
        className="flex items-center gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      >
        {Array.from({ length: starCount }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.12, duration: 0.5, ease: "easeOut" }}
            style={{
              fontSize: "20px",
              color: "#f4d58c",
              textShadow: "0 0 10px rgba(244, 213, 140, 0.55)",
            }}
          >
            ✦
          </motion.span>
        ))}
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.9, ease: "easeOut" }}
        style={{
          fontFamily: "var(--font-ridi-batang)",
          color: "#f5ead6",
          fontSize: "clamp(20px, 3.2vw, 30px)",
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.55 }}
        transition={{ delay: 2.4, duration: 1.2 }}
        className="absolute bottom-[18%] text-[16px] italic text-[#bba175]"
      >
        화면을 누르면 다음으로
      </motion.p>
    </button>
  );
}
