"use client";

import { useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { renderTemplate } from "@/lib/v3/scenes/template";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function ValueRankScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const [pick, setPick] = useState(session.topValue || session.selectedValues[0] || "");
  const [settled, setSettled] = useState(false);
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const submit = () => {
    if (!pick) return;
    patch({ topValue: pick });
    if (typeof spec.next === "string") onAdvance(spec.next);
  };
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5">
        {narration && <NarrationBlock text={narration} />}
        <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />
        {settled && (
          <div className="grid gap-3 sm:grid-cols-3">
            {session.selectedValues.map((v) => {
              const def = session.valueDefinitions[v] ?? "";
              const selected = pick === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPick(v)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
                    selected ? "border-[#3d2414] bg-[#3d2414] text-white" : "border-[#b99b6b]/40 bg-white/40 text-[#3d2414]"
                  }`}
                >
                  <p className="font-medium">{v}</p>
                  {def && <p className="mt-2 line-clamp-3 text-[14px] opacity-80">{def}</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        className={`mt-auto flex justify-end transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3 label={spec.buttonLabel ?? "이게 가장 가까워요"} onClick={submit} disabled={!pick} />
      </div>
    </div>
  );
}
