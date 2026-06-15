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
      // ritual press 가 끝나면 pressed 를 해제해 동일 버튼을 다시 누를 수
      // 있게 한다. 씬 전환이 일어나는 케이스에서는 컴포넌트가 unmount 되어
      // 무해, 종결 페이지처럼 같은 화면에 머무는 케이스에서는 재사용 가능.
      setPressed(false);
    }, 450);
  };

  // h-12 (48px) 고정 — variant/size 따라 가로 패딩과 폰트만 달라짐.
  // 화면 곳곳 '건네기' 류 버튼 높이가 매번 달라 보였다는 피드백 반영.
  const sizing = ritual
    ? size === "lg"
      ? "h-12 inline-flex items-center justify-center px-8 text-[16px] font-serif italic tracking-[0.04em]"
      : "h-12 inline-flex items-center justify-center px-6 font-serif italic tracking-[0.04em]"
    : "h-12 inline-flex items-center justify-center px-5 text-sm tracking-[0.02em]";
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
