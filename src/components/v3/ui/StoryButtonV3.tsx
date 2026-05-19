"use client";

import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  ritual?: boolean;
  /** 'primary' (default) — dark bg / cream text, for light backgrounds.
   *  'secondary' — cream bg / dark text, for use on dark backgrounds.
   *  'tertiary' — accent gold/tan bg / dark text, for the 3rd option in
   *    multi-choice scenes so all options read as visually distinct. */
  variant?: "primary" | "secondary" | "tertiary";
  /** 'md' (default) | 'lg' for feature CTAs that need more presence. */
  size?: "md" | "lg";
}

export function StoryButtonV3({ label, onClick, disabled, ritual, variant = "primary", size = "md" }: Props) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    if (!ritual) {
      onClick();
      return;
    }
    setPressed(true);
    setTimeout(() => {
      onClick();
    }, 450);
  };

  const sizing = ritual
    ? size === "lg"
      ? "px-8 py-3 text-[16px] font-serif italic tracking-[0.04em]"
      : "px-6 py-3 font-serif italic tracking-[0.04em]"
    : "px-5 py-2.5 text-sm tracking-[0.02em]";
  const palette =
    variant === "secondary"
      ? "bg-[#f5ead6] text-[#3d2414] border border-[#3d2414]/30"
      : variant === "tertiary"
        ? "bg-[#b99b6b] text-[#3d2414]"
        : ritual
          ? "bg-[#3d2414] text-[#f4d58c]"
          : "bg-[#3d2414] text-[#f5ead6]";

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || pressed}
      animate={pressed ? { scale: [1, 1.06, 1], boxShadow: ["0 0 0 0 rgba(244,213,140,0)", "0 0 24px 6px rgba(244,213,140,0.6)", "0 0 0 0 rgba(244,213,140,0)"] } : {}}
      transition={{ duration: 0.45, ease: "easeOut" }}
      whileHover={!disabled && !pressed ? { scale: 1.02 } : {}}
      whileTap={!disabled && !pressed ? { scale: 0.98 } : {}}
      className={`rounded-md ${sizing} ${palette} transition disabled:opacity-40`}
    >
      {label}
    </motion.button>
  );
}
