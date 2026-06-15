"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { HintInput } from "@/components/v3/ui/HintInput";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { DialogStageContext } from "@/components/v3/V3App";
import { useEnterToAdvance } from "@/lib/v3/useEnterToAdvance";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

const PAGINATE_THRESHOLD = 3;

export function QuestionScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const initial = spec.saveTo ? String(session[spec.saveTo] ?? "") : "";
  const [value, setValue] = useState(initial);
  const [inputReady, setInputReady] = useState(false);
  const [editorNoteReady, setEditorNoteReady] = useState(false);
  const [inputVisible, setInputVisible] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const [showLines, setShowLines] = useState(!narration);
  const { setStage } = useContext(DialogStageContext);
  // Question 씬은 (1) narration 단계 — Enter 로 lines 로 이동, (2) input 단계 —
  // 입력창이 포커스를 갖는 동안은 hook 이 자체적으로 무시함.
  useEnterToAdvance(() => setShowLines(true), !showLines && Boolean(narration));
  const ritual =
    !spec.buttonLabel ||
    spec.buttonLabel === "전달하기" ||
    spec.buttonLabel === "건네기" ||
    spec.buttonLabel === "이렇게 부를래요" ||
    spec.buttonLabel === "이렇게 적어봤어요";

  // Long lead-ins (3+ lines) paginate so the input field gets a clean final page.
  // Short prompts (<= 2 lines) render in one shot via AutoFlowText.
  const usePagination = lines.length >= PAGINATE_THRESHOLD;

  useEffect(() => {
    // Compact dialog while showing italic stage-direction prelude OR paging
    // through long lead-in lines. Grow only when the input field appears.
    const compact = (!showLines && narration) || !inputReady;
    setStage(compact ? "narration" : "content");
  }, [showLines, narration, inputReady, setStage]);

  const handleSettled = useCallback((isLast: boolean) => {
    if (isLast) setInputReady(true);
  }, []);

  useEffect(() => {
    if (!inputReady) {
      setEditorNoteReady(false);
      setInputVisible(false);
      return;
    }

    if (!spec.editorNote) {
      setInputVisible(true);
      return;
    }

    setEditorNoteReady(true);
    const t = window.setTimeout(() => setInputVisible(true), 500);
    return () => window.clearTimeout(t);
  }, [inputReady, spec.editorNote]);

  const submit = () => {
    if (!spec.saveTo) return;
    if (value.trim().length === 0) return;
    patch({ [spec.saveTo]: value.trim() } as Partial<V3Session>);
    if (typeof spec.next === "string") {
      onAdvance(spec.next);
    } else if (typeof spec.next === "function") {
      onAdvance(spec.next({ ...session, [spec.saveTo]: value.trim() } as V3Session));
    }
  };

  if (!showLines && narration) {
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={() => setShowLines(true)}
      >
        <div className="flex-1">
          <NarrationBlock text={narration} />
        </div>
        <div className="mt-auto flex items-center justify-end text-[16px] text-[#8b7050]">
          <span className="italic">다음</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4">
        {usePagination ? (
          <PaginatedNarration lines={lines} onSettled={handleSettled} tight={inputReady} />
        ) : (
          <AutoFlowText lines={lines} onSettled={() => setInputReady(true)} />
        )}
        {editorNoteReady && spec.editorNote && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="border-l-2 border-[#b99b6b]/50 pl-3 text-[16px] italic leading-[1.6] text-[#8b7050]"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          >
            편집장의 한마디 — {renderTemplate(spec.editorNote, session)}
          </motion.p>
        )}
        {inputVisible && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          >
            <HintInput
              value={value}
              onChange={setValue}
              placeholder={spec.placeholder ? renderTemplate(spec.placeholder, session) : undefined}
              hint={spec.inputHint ? renderTemplate(spec.inputHint, session) : undefined}
            />
          </motion.div>
        )}
      </div>
      {/* Absolute-anchored to dialog bottom-right (mirrors the "이전" button
          which sits absolute bottom-6 left-6). Keeps button position fixed
          regardless of content height so short questions don't leave a big
          empty gap between the input and the action button. */}
      <div
        className={`absolute bottom-6 right-6 z-10 flex h-[44px] items-center transition-opacity duration-500 ${
          inputVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "전달하기"}
          onClick={submit}
          disabled={value.trim().length === 0}
          ritual={ritual}
        />
      </div>
      {inputVisible && spec.reviewFields && spec.reviewFields.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowReview(true)}
            className="absolute right-6 top-6 text-[16px] italic text-[#8b7050] underline decoration-dotted underline-offset-[3px] transition hover:text-[#3d2414]"
          >
            내 답변 다시 보기
          </button>
          {showReview && (
            <div className="fixed inset-0 z-50 bg-black/35" onClick={() => setShowReview(false)}>
              <aside
                className="absolute right-0 top-0 h-full w-full max-w-[360px] overflow-y-auto bg-[#f6efdf] px-6 py-7 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                style={{ fontFamily: "var(--font-ridi-batang)" }}
              >
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-[18px] font-semibold text-[#3d2414]">내 답변 다시 보기</h3>
                  <button
                    type="button"
                    onClick={() => setShowReview(false)}
                    className="text-[24px] leading-none text-[#8b7050] transition hover:text-[#3d2414]"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-4">
                  {spec.reviewFields.map(({ label, field }) => {
                    // Support both V3Session fields and synthetic resolver keys
                    let raw: unknown;
                    if (field in session) {
                      raw = (session as unknown as Record<string, unknown>)[field];
                    } else {
                      // Field is not a direct session key — assume it's handled elsewhere
                      raw = "";
                    }
                    const text = Array.isArray(raw)
                      ? raw.filter(Boolean).join(" · ")
                      : String(raw ?? "").trim();
                    return (
                      <div key={field} className="rounded-md border border-[#b99b6b]/30 bg-white/45 px-4 py-3">
                        <p className="text-[16px] tracking-wide text-[#8b7050]">{label}</p>
                        <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.7] text-[#3d2414]">
                          {text || <span className="italic text-[#a18965]">아직 답변이 없어요</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
