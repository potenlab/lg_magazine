"use client";

import { useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function BinaryChoiceScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [settled, setSettled] = useState(false);
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const choices = spec.choices ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5">
        {narration && <NarrationBlock text={narration} />}
        <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />
      </div>
      <div
        className={`mt-auto flex flex-wrap justify-end gap-3 transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {choices.map((c, i) => {
          // Rotate variants so 2-3 button rows read as visually distinct
          // options (primary / secondary / tertiary). Single-button scenes
          // route through other components — this rotation only matters for
          // multi-choice rows in BinaryChoice.
          const variant = (["primary", "secondary", "tertiary"] as const)[i % 3];
          return (
            <StoryButtonV3
              key={i}
              label={c.label}
              onClick={() => {
                if (c.set) patch(c.set);
                onAdvance(c.next);
              }}
              ritual
              variant={variant}
            />
          );
        })}
      </div>
    </div>
  );
}
