"use client";

import { useContext, useEffect, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
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

      {/* Footer — 이전 + 선택하기 in same row. sticky so it stays visible
          on short screens; transparent (no border / bg) so it doesn't paint
          a distracting band over the parchment dialog. */}
      <div className="sticky bottom-0 z-10 -mx-7 -mb-7 mt-1 flex items-center justify-between px-7 py-3">
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
        <button
          type="button"
          onClick={confirm}
          disabled={selected === null}
          className={`rounded-md bg-[#3d2414] px-6 py-3 text-[16px] text-[#f5ead6] transition hover:bg-[#5a3520] active:scale-95 ${
            selected === null ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {spec.buttonLabel ?? "선택하기"}
        </button>
      </div>
    </div>
  );
}
