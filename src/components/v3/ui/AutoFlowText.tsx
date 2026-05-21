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

  // Notify parent once all lines have appeared. Wait for the final line's
  // fade-in to complete (+ small dwell) so the input/button doesn't appear
  // while the last sentence is still animating in. Prevents the "인풋만
  // 먼저 나와있는" feel where the input field beat the question text.
  useEffect(() => {
    if (shown < displayLines.length || !onSettled) return;
    const SETTLE_DELAY_MS = FADE_DURATION_MS + 250;
    const t = setTimeout(() => onSettled(), SETTLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [shown, displayLines.length, onSettled]);

  return (
    <div className="space-y-1 leading-[1.58] text-[#3d2414]">
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
