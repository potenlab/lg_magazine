"use client";

import { useContext, useEffect, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { TOOL_CATEGORIES } from "@/lib/v3/toolOptions";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

const MAX_PER_BOX = 2;

/**
 * [13p] Dual tool selector. Two checkbox boxes share the same 8-option list
 * (4 categories × 2): the left box is what the participant uses best now
 * (→ currentTool), the right box is what they want to grow (→ growthTool).
 * Each box allows up to 2 picks. Read by v3GenerateVisionDirections to shape
 * vision sentence 2.
 */
export function ToolSelectScene({
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
  const [current, setCurrent] = useState<string[]>(session.currentTool);
  const [growth, setGrowth] = useState<string[]>(session.growthTool);
  const [settled, setSettled] = useState(false);
  const { setStage } = useContext(DialogStageContext);

  // toolSelect is a FULL_HEIGHT_KIND — pin stage to "content" on mount so
  // V3App gives it the tall scrollable dialog wrapper (same as valueCards).
  useEffect(() => {
    setStage("content");
  }, [setStage]);

  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));

  const toggle = (
    picked: string[],
    setPicked: (v: string[]) => void,
    label: string,
  ) => {
    if (picked.includes(label)) {
      setPicked(picked.filter((p) => p !== label));
    } else if (picked.length < MAX_PER_BOX) {
      setPicked([...picked, label]);
    }
  };

  const canSubmit = current.length > 0 && growth.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    patch({ currentTool: current, growthTool: growth });
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  return (
    <div className="flex flex-col gap-5">
      <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />

      {settled && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ToolBox
              title="지금 가장 잘 쓰는 도구"
              picked={current}
              onToggle={(label) => toggle(current, setCurrent, label)}
            />
            <ToolBox
              title="앞으로 더 키우고 싶은 도구"
              picked={growth}
              onToggle={(label) => toggle(growth, setGrowth, label)}
            />
          </div>

          {spec.editorNote && (
            <p
              className="border-l-2 border-[#b99b6b]/50 pl-3 text-[16px] italic leading-[1.6] text-[#8b7050]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              편집장의 한마디 — {renderTemplate(spec.editorNote, session)}
            </p>
          )}
        </>
      )}

      {/* Footer — dialog wrapper(overflow-y-auto, p-6) 안에서 sticky bottom-0
          으로 viewport 하단 고정. 음수 마진(-mx-6 -mb-6)으로 wrapper 의
          p-6 패딩 가장자리까지 background 가 닿게 해서 스크롤 콘텐츠 위로
          살짝 떠 있는 느낌. */}
      <div
        className={`sticky bottom-0 z-10 -mx-6 -mb-6 mt-2 flex items-center justify-between gap-3 border-t border-[#d7bd83]/30 bg-[#f6efdf]/95 px-6 py-3 backdrop-blur transition-opacity duration-500 ${settled ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
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
          label={spec.buttonLabel ?? "건네기"}
          onClick={submit}
          disabled={!canSubmit}
          ritual
        />
      </div>
    </div>
  );
}

function ToolBox({
  title,
  picked,
  onToggle,
}: {
  title: string;
  picked: string[];
  onToggle: (label: string) => void;
}) {
  const full = picked.length >= MAX_PER_BOX;
  return (
    <div className="rounded-md border border-[#b99b6b]/40 bg-white/40 p-4">
      <p className="text-[16px] font-semibold text-[#3d2414]">
        {title}
        <span className="ml-1.5 text-[16px] font-normal text-[#8b7050]">
          최대 2개 · {picked.length}/2
        </span>
      </p>
      <div className="mt-3 space-y-3">
        {TOOL_CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <p className="mb-1 text-[16px] font-semibold tracking-wide text-[#8b7050]">
              {cat.label}
            </p>
            <div className="space-y-1.5">
              {cat.options.map((opt) => {
                const selected = picked.includes(opt.label);
                const disabled = !selected && full;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggle(opt.label)}
                    disabled={disabled}
                    className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition disabled:opacity-35 ${
                      selected
                        ? "border-[#3d2414] bg-[#ede1c6]"
                        : "border-[#b99b6b]/40 bg-white/55 hover:bg-[#f0e4c8]/70"
                    }`}
                  >
                    <span
                      className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        selected ? "border-[#3d2414] bg-[#3d2414]" : "border-[#b99b6b]"
                      }`}
                    >
                      {selected && (
                        <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4l3 3 5-6"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[16px] font-medium leading-snug text-[#3d2414]">
                        {opt.label}
                      </span>
                      <span className="text-[16px] leading-snug text-[#6b5337]">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
