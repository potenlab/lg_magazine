"use client";

import { useEffect } from "react";

/**
 * 키보드 Enter 로 "다음 / 건네기" 같은 주요 진행 액션을 트리거하는 훅.
 *
 * 규칙
 * - 사용자가 INPUT/TEXTAREA/contenteditable 에 포커스를 두고 있을 때는 동작하지 않음
 *   (답변 입력창의 Enter 와 충돌 방지).
 * - 모달 안이거나 별도 흐름이 있는 곳에서는 `enabled=false` 로 끌 수 있음.
 * - 같은 씬 안에서 여러 번 호출하지 말 것 — 마지막 등록이 이긴다.
 */
export function useEnterToAdvance(handler: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (e.isComposing) return; // 한글 IME 조합 중 Enter 무시
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      }
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler, enabled]);
}
