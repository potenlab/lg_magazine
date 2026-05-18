"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { VALUE_CARD_CATEGORIES, type ValueCardCategory } from "@/lib/v3/valueCards";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

const CATEGORY_BY_VALUE: Map<string, ValueCardCategory> = (() => {
  const m = new Map<string, ValueCardCategory>();
  for (const cat of VALUE_CARD_CATEGORIES) {
    for (const c of cat.cards) m.set(c, cat);
  }
  return m;
})();

/**
 * Show all selected values side-by-side, each as a card with its own
 * textarea so the participant can write what each one means in parallel.
 * Custom-typed values (not in VALUE_CARD_CATEGORIES) are tagged "자유단어".
 * Submits all definitions at once into `valueDefinitions[v]`.
 */
export function ValueDefSingleScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const values = session.selectedValues;
  const [defs, setDefs] = useState<Record<string, string>>(() =>
    Object.fromEntries(values.map((v) => [v, session.valueDefinitions[v] ?? ""])),
  );
  const [settled, setSettled] = useState(false);
  const { setStage } = useContext(DialogStageContext);

  // Cards render from mount, so the dialog always needs the input-sized
  // wrapper. Pinning to "content" avoids the compact→expand jump that
  // briefly clipped the cards on first render.
  useEffect(() => {
    setStage("content");
  }, [setStage]);

  const lines = useMemo(() => {
    if (spec.lines && spec.lines.length > 0) {
      return spec.lines.map((l) => renderTemplate(l, session));
    }
    return [
      `${values.length}가지의 단어를 선택해주셨네요. 좋습니다.`,
      `같은 단어여도 사람마다 그 의미가 조금씩 달라요. 고르신 단어들은 ${session.name}님께 어떤 의미인가요?`,
      `사전적 정의가 아니어도 좋아요. ${session.name}님이 느끼는 그 단어의 의미를 적어주세요.`,
    ];
  }, [spec.lines, session, values.length]);

  const allFilled = values.length > 0 && values.every((v) => (defs[v] ?? "").trim().length > 0);

  const submit = () => {
    if (!allFilled) return;
    const merged = { ...session.valueDefinitions };
    for (const v of values) merged[v] = (defs[v] ?? "").trim();
    // v3 ch2 has no separate "rank these" step — the first selected value is
    // treated as topValue. Several downstream scenes (ch4 narration, magazine
    // poster/handoff, PatternConfirm LLM call) read session.topValue; without
    // this assignment they render empty quotes (e.g. '그리고 ""을 가장
    // 소중히 여기시는 분'). Mirrors the auto-set already done in
    // ValueQuestionScene when the user picks just one value.
    const nextTopValue = session.topValue && values.includes(session.topValue)
      ? session.topValue  // honor an existing pick if it's still in the set
      : values[0];
    patch({ valueDefinitions: merged, topValue: nextTopValue });
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  if (values.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[#8b7050]">
        <p>고른 단어가 없네요…</p>
      </div>
    );
  }

  const gridCols =
    values.length === 1 ? "sm:grid-cols-1" : values.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5">
        <div className="shrink-0">
          <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />
        </div>
        <div
          className={`grid gap-4 transition-opacity duration-500 ${gridCols} ${
            settled ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {values.map((v) => {
            const cat = CATEGORY_BY_VALUE.get(v);
            return (
              <div
                key={v}
                className="flex flex-col gap-3 rounded-md border border-[#b99b6b]/40 bg-white/75 p-4 shadow-sm"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[12px] tracking-wide text-[#8b7050]">
                    {cat ? (
                      <>
                        <span className="mr-1">{cat.emoji}</span>
                        {cat.label}
                      </>
                    ) : (
                      "자유단어"
                    )}
                  </span>
                  <span className="text-[18px] font-medium text-[#3d2414]">{v}</span>
                </div>
                <textarea
                  rows={6}
                  value={defs[v] ?? ""}
                  onChange={(e) => setDefs((prev) => ({ ...prev, [v]: e.target.value }))}
                  placeholder={`이 단어가 ${session.name}님에게\n어떤 의미인지 적어주세요.`}
                  className="min-h-[150px] w-full resize-none rounded-md border border-[#b99b6b]/30 bg-white/80 p-3 text-[14px] leading-[1.6] text-[#3d2414] placeholder:text-[#a18965] focus:border-[#3d2414]/60 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* Absolute-anchored to dialog bottom-right — mirrors the "이전" button
          (absolute bottom-7 left-7) so the two sit at the same height. */}
      <div
        className={`absolute bottom-7 right-7 z-10 flex h-[44px] items-center transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "전달하기"}
          onClick={submit}
          disabled={!allFilled}
          ritual
        />
      </div>
    </div>
  );
}
