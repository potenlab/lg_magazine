"use client";

import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function AmbienceScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session } = useV3Session();
  const { setStage } = useContext(DialogStageContext);
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const hasLines = lines.length > 0;

  // Cinematic 3-phase flow only when `cinematic: true` is set on the spec AND
  // the scene has narration. Otherwise the scene renders in plain mode (phase 2)
  // — same as non-cinematic ambience scenes (just narration + optional lines in
  // a normal dialog box).
  //   phase 0 (hidden):  background only, full-screen click overlay — no dialog
  //   phase 1 (ambient): semi-transparent (~55%) dialog reveals the narration
  //   phase 2 (content): paginated dialog lines (if any), else advance
  const cinematic = !!spec.cinematic;
  // Initial phase:
  //   - cinematic + narration → 0 (no dialog, click to reveal)
  //   - non-cinematic + narration → 1 (narration in normal dialog, click to advance)
  //   - no narration → 2 (straight to lines)
  const initialPhase: 0 | 1 | 2 = cinematic && narration ? 0 : narration ? 1 : 2;
  const [phase, setPhase] = useState<0 | 1 | 2>(initialPhase);

  useEffect(() => {
    // Cinematic uses hidden/ambient stages; non-cinematic uses the standard
    // content stage even during narration display.
    if (cinematic && phase === 0) setStage("hidden");
    else if (cinematic && phase === 1) setStage("ambient");
    else setStage("content");
    // CRITICAL: reset stage on unmount so the *next* scene doesn't inherit
    // our "hidden" or "ambient" stage. Without this, scenes after a cinematic
    // ambience render with the transparent / hidden parchment.
    return () => setStage("content");
  }, [cinematic, phase, setStage]);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  // Phase 0 — full-screen click overlay; dialog motion.div is hidden by stage="hidden".
  // IMPORTANT: rendered via createPortal to document.body to escape the framer-motion
  // motion.div ancestor. `position:fixed` inside a transformed ancestor is positioned
  // relative to that ancestor (not viewport), which would shrink our overlay to the
  // tiny dialog footprint. Portal sidesteps this by rendering outside the motion
  // subtree entirely.
  if (cinematic && phase === 0 && narration) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <>
        <div
          className="fixed inset-0 z-30 cursor-pointer"
          onClick={() => setPhase(1)}
          aria-label="장면 진행"
        />
        <div className="pointer-events-none fixed bottom-12 right-12 z-40 text-[14px] italic text-[#f5ead6]/70">
          다음
        </div>
      </>,
      document.body,
    );
  }

  // Phase 1 — narration in transparent dialog. Fullscreen click overlay rendered
  // via portal (same reason as phase 0) so the whole viewport is clickable, not
  // just the dialog. Overlay sits at z-[25], behind any header chrome but above
  // the dialog wrapper. Dialog content is rendered inline so it appears inside
  // the (transparent) motion.div as usual.
  if (cinematic && phase === 1 && narration) {
    const handle = () => (hasLines ? setPhase(2) : advance());
    return (
      <>
        {typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed inset-0 z-[25] cursor-pointer"
              onClick={handle}
              aria-label="장면 진행"
            />,
            document.body,
          )}
        <div className="pointer-events-none flex flex-1 flex-col">
          <div className="flex-1">
            <NarrationBlock text={narration} />
          </div>
          <div className="absolute bottom-7 right-7 z-10 flex h-[44px] items-center text-[14px] text-[#8b7050]">
            <span className="italic">다음</span>
          </div>
        </div>
      </>
    );
  }

  // Non-cinematic narration-first (legacy two-stage): show narration in the
  // standard parchment dialog, click to reveal lines (if any) or advance.
  if (!cinematic && narration && phase !== 2) {
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={() => (hasLines ? setPhase(2) : advance())}
      >
        <div className="flex-1">
          <NarrationBlock text={narration} />
        </div>
        <div className="absolute bottom-7 right-7 z-10 flex h-[44px] items-center text-[14px] text-[#8b7050]">
          <span className="italic">다음</span>
        </div>
      </div>
    );
  }

  // Phase 2 — paginated dialog lines (or direct lines if no narration).
  return (
    <div className="flex flex-1 flex-col gap-4">
      <PaginatedNarration lines={lines} pageSize={spec.pageSize} onAdvance={advance} />
    </div>
  );
}
