"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { EditorialInline, toEditorialBlocks } from "@/components/v3/ui/EditorialText";

const PER_LINE_DELAY_MS = 1500;
const FADE_DURATION_MS = 600;

export function AutoFlowText({
  lines,
  onSettled,
}: {
  lines: string[];
  onSettled?: () => void;
}) {
  const displayLines = useMemo(() => toEditorialBlocks(lines), [lines]);
  // Lines all settled when shown >= length
  const [shown, setShown] = useState(0);

  // Stagger reveal
  useEffect(() => {
    if (shown >= displayLines.length) return;
    const t = setTimeout(
      () => setShown((s) => Math.min(s + 1, displayLines.length)),
      shown === 0 ? 100 : PER_LINE_DELAY_MS
    );
    return () => clearTimeout(t);
  }, [shown, displayLines.length]);

  // Notify parent once all lines have appeared (used to gate the manual "다음" hint).
  useEffect(() => {
    if (shown >= displayLines.length && onSettled) onSettled();
  }, [shown, displayLines.length, onSettled]);

  return (
    <div className="space-y-4 leading-[1.58] text-[#3d2414]">
      {displayLines.slice(0, shown).map((line, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: FADE_DURATION_MS / 1000, ease: "easeOut" }}
          className="whitespace-pre-line break-words"
        >
          <EditorialInline text={line} />
        </motion.p>
      ))}
    </div>
  );
}
