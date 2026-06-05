"use client";

import { useContext, useEffect, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * 3-option card selector for Ch3 [12p] / [13p].
 * Shows a question, then 3 full-width selectable cards (label + description).
 * On selection → highlight card → show confirm button → save + advance.
 */
export function CardChoiceScene({
  spec,
  onAdvance,
  onPrev,
  canGoBack,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
  onPrev?: () => void;
  canGoBack?: boolean;
}) {
  const { session, patch } = useV3Session();
  const [settled, setSettled] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const { setStage } = useContext(DialogStageContext);

  // CRITICAL: pin stage to "content" on mount. Scene components own their
  // own stage — without this, the previous scene's "narration" stage leaks
  // through and V3App falls back to the h-[240px] overflow-hidden wrapper,
  // clipping the 2nd/3rd choice cards. (This is the "cards got clipped
  // again" regression — direct ?scene= jumps masked it because stage
  // defaults to "content".)
  useEffect(() => {
    setStage("content");
  }, [setStage]);

  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const choices = spec.choices ?? [];

  const confirm = () => {
    if (selected === null) return;
    const c = choices[selected];
    if (c.set) patch(c.set);
    onAdvance(c.next);
  };

  return (
    // 상단/중간/하단 3-영역. flex-1 안 씀 — 콘텐츠가 자연 높이로 쌓이도록.
    // 콘텐츠가 wrapper max-h 를 넘으면 중간 영역(overflow-y-auto + min-h-0)이
    // shrink 되며 그 안에서만 스크롤. 짧을 땐 대사 → 선택지 → 버튼이 빈 공간
    // 없이 바로 이어짐.
    <div className="flex h-full max-h-full w-full flex-col">
      {/* 상단 — narration + 질문 라인 (정적) */}
      <div className="shrink-0 space-y-4">
        {narration && <NarrationBlock text={narration} />}
        <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />
      </div>

      {/* 중간 — 선택 카드. flex-1 X, min-h-0 overflow-y-auto 로 콘텐츠가
          dialog 를 넘칠 때만 안에서 스크롤. */}
      {settled && (
        <div className="min-h-0 overflow-y-auto pt-3">
          <div className="flex flex-col gap-3">
            {choices.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className={`flex items-start gap-3 rounded-md border px-5 py-4 text-left transition ${
                  selected === i
                    ? "border-[#3d2414]/50 bg-[#ede1c6] text-[#3d2414]"
                    : "border-[#b99b6b]/40 bg-white/50 text-[#3d2414] hover:bg-[#f0e4c8]/70"
                }`}
              >
                <span
                  className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                    selected === i
                      ? "border-[#3d2414] bg-[#3d2414]"
                      : "border-[#b99b6b]"
                  }`}
                >
                  {selected === i && (
                    <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[16px] font-semibold leading-snug">
                    {c.label}
                  </span>
                  {c.description && (
                    <span className="text-[16px] leading-snug text-[#6b5337]">
                      {c.description}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 하단 — 이전/선택하기 (정적, 항상 보임) */}
      <div className="shrink-0 mt-3 flex items-center justify-between gap-3">
        {onPrev && canGoBack ? (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-[44px] items-center italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414]"
          >
            이전
          </button>
        ) : (
          <span />
        )}
        <StoryButtonV3
          label={spec.buttonLabel ?? "선택하기"}
          onClick={confirm}
          disabled={selected === null}
          ritual
        />
      </div>
    </div>
  );
}
