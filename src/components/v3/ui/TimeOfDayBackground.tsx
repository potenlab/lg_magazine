"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { TimeOfDay } from "@/lib/v3/scenes/types";

const COMMON = "/vision_express/common";

// Time-based fallback. Now uses chapter master images since the old
// dawn-room/night-room etc. were moved to background_backup.
const BG_BY_TIME: Record<TimeOfDay, string> = {
  preBoard:        `${COMMON}/inside-station.jpg`,
  sunset:          `${COMMON}/Chapter_01.jpg`,
  dusk:            `${COMMON}/Chapter_01.jpg`,
  starsRising:     `${COMMON}/Chapter_02.jpg`,
  starsFull:       `${COMMON}/Chapter03.jpg`,
  midnight:        `${COMMON}/Chapter03.jpg`,
  dawnPink:        `${COMMON}/chapter04.jpg`,
  dawnFirstLight:  `${COMMON}/chapter05.jpg`,
};

// Per-chapter master background. Used when a scene doesn't override bgImage.
// Files live in /public/vision_express/common/ — note mixed Chapter_/chapter
// naming preserved from the source asset filenames.
const BG_BY_CHAPTER: Record<number, string> = {
  1: `${COMMON}/Chapter_01.jpg`,
  // ch2 기본 배경 — 객실 램프가 켜진 (Chapter02-3) 이미지로 통일.
  // 사용자가 1-6b에서 램프를 켠 이후부터 ch2 전체가 같은 조명 분위기여야 자연스럽다.
  2: `${COMMON}/Chapter02-3.jpg`,
  3: `${COMMON}/Chapter03.jpg`,
  4: `${COMMON}/chapter04.jpg`,
};

// Subtle color tint per time-of-day, layered on top of the bg for crossfade.
// Kept light because the new cabin images already carry their own atmosphere.
const OVERLAY_BY_TIME: Record<TimeOfDay, string> = {
  preBoard:        "rgba(20,12,6,0.20)",
  sunset:          "rgba(60,20,8,0.15)",
  dusk:            "rgba(20,12,8,0.25)",
  starsRising:     "rgba(8,10,30,0.25)",
  starsFull:       "rgba(5,8,30,0.30)",
  midnight:        "rgba(2,4,20,0.35)",
  dawnPink:        "rgba(40,18,30,0.18)",
  dawnFirstLight:  "rgba(60,40,40,0.10)",
};

export function TimeOfDayBackground({
  time,
  bgImage,
  bgColor,
  chapter,
}: {
  time: TimeOfDay;
  bgImage?: string;
  bgColor?: string;
  chapter?: number;
}) {
  // Priority: explicit bgImage > per-chapter master > time-based fallback.
  const chapterBg = chapter != null ? BG_BY_CHAPTER[chapter] : undefined;
  const src = bgImage ?? chapterBg ?? BG_BY_TIME[time];
  const tint = bgImage || bgColor || chapterBg ? "rgba(0,0,0,0)" : OVERLAY_BY_TIME[time];
  const key = bgColor ?? bgImage ?? chapterBg ?? time;
  return (
    <>
      {bgColor ? (
        <AnimatePresence mode="sync">
          <motion.div
            key={`bg-${key}`}
            className="absolute inset-0"
            style={{ background: bgColor }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </AnimatePresence>
      ) : (
        <AnimatePresence mode="sync">
          <motion.div
            key={`bg-${key}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            style={{ transform: "scale(1.1)", transformOrigin: "center center" }}
          >
            <Image
              src={src}
              alt=""
              fill
              priority
              className="object-cover"
              style={{ objectPosition: "center 35%" }}
            />
          </motion.div>
        </AnimatePresence>
      )}
      <AnimatePresence mode="sync">
        <motion.div
          key={`tint-${key}`}
          className="absolute inset-0"
          style={{ background: tint }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      </AnimatePresence>
    </>
  );
}
