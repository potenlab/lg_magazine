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
    // Fill the full dialog width — same as question/followup scenes whose
    // textarea spans the whole dialog. The previous 720px cap left an empty
    // right-side gutter that didn't match the other input scenes.
    <div className="flex w-full flex-col gap-5">
      {/* Stage direction */}
      {narration && <NarrationBlock text={narration} />}

      {/* Question lines */}
      <div className="space-y-4">
        <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />

        {/* Cards */}
        {settled && (
          <div className="mt-3 flex flex-col gap-3">
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
                {/* Radio circle */}
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
        )}
      </div>

      {/* Footer — wrapper 가 overflow-y-auto 라 absolute bottom 은 스크롤 콘텐츠
          끝에 붙음. sticky bottom-0 + 음수 마진(-mx-6 -mb-6, mt-2)으로 viewport
          하단에 고정해 스크롤 위로 떠 있게. wrapper 의 pb-[92px] 가 sticky
          footer 가 콘텐츠 마지막 줄을 가리지 않도록 여백을 미리 잡아둠. */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-2 flex items-center justify-between gap-3 border-t border-[#d7bd83]/30 bg-[#f6efdf]/95 px-6 py-3 backdrop-blur">
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
