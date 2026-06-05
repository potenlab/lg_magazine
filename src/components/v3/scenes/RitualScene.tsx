"use client";

import { useCallback, useEffect, useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { useCornerHint } from "@/components/v3/context/CornerHintContext";
import { useEnterToAdvance } from "@/lib/v3/useEnterToAdvance";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function RitualScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session } = useV3Session();
  const { setHint } = useCornerHint();
  const [buttonReady, setButtonReady] = useState(false);

  // Clear any corner-control highlight when leaving this scene.
  useEffect(() => () => setHint(null), [setHint]);
  // Pulse the corner button this paginated-narration page points at.
  const handlePageChange = useCallback(
    (pageIndex: number) => setHint(spec.cornerHints?.[pageIndex] ?? null),
    [setHint, spec.cornerHints],
  );
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const [showLines, setShowLines] = useState(!narration);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };
  useEnterToAdvance(() => {
    if (!showLines && narration) setShowLines(true);
    else if (buttonReady || !lines.length) advance();
  });

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

  // No spoken lines — straight to the ritual button (e.g. C-4 outro).
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex-1" />
        <div className="mt-auto flex justify-end">
          <StoryButtonV3 label={spec.buttonLabel ?? "네"} onClick={advance} ritual />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PaginatedNarration
        lines={lines}
        pageSize={spec.pageSize}
        onPageChange={handlePageChange}
        onSettled={(isLastPage) => {
          if (isLastPage) setButtonReady(true);
        }}
      />
      <div
        className={`mt-auto flex justify-end transition-opacity duration-500 ${
          buttonReady ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3 label={spec.buttonLabel ?? "네"} onClick={advance} ritual />
      </div>
    </div>
  );
}
