"use client";

import { useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function OwlNarrationScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session } = useV3Session();
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;

  // Two-stage: narration alone first, then dialog lines on click.
  const [showLines, setShowLines] = useState(!narration);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  if (!showLines && narration) {
    // Narration-only scene (no lines): click advances directly to the next scene.
    const onClick = lines.length === 0 ? advance : () => setShowLines(true);
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={onClick}
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
    <div className="flex flex-1 flex-col gap-4">
      <PaginatedNarration lines={lines} pageSize={spec.pageSize} onAdvance={advance} />
    </div>
  );
}
