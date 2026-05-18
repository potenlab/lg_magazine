"use client";

import { useContext, useEffect, useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * [22p] Editor synthesis WOW.
 * Weaves four ingredients (Ch1 두 몰입 경험 / Ch2 가치 / Ch2 강점 공통 결 /
 * Ch2 타인이 보는 나) into 3~4 editor-voice sentences and shows them as a
 * standalone narration beat. Click-to-advance — the alignment question
 * (이미 알고 있었어요 / 새롭게 보였어요 / 반반이에요) lives on the next scene
 * (2-7-align binaryChoice) so the synthesis read isn't crowded by buttons.
 *
 * Resume support: the result is cached on session.strengthSynthesis so the
 * scene re-renders the same lines without re-calling the LLM.
 */
export function StrengthSynthesisScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [synthesis, setSynthesis] = useState<string>(session.strengthSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.strengthSynthesis));
  const { setStage } = useContext(DialogStageContext);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.synthesizeStrength({
          name: session.name,
          flowExperience1: session.flowExperience1,
          flowExperience2: session.flowExperience2,
          selectedValues: session.selectedValues
            .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
            .filter((v) => v.word.trim().length > 0),
          strengthCommonAsk: session.strengthCommonAsk,
          othersDescription: session.othersDescription,
        });
        if (cancelled) return;
        const text = (r.synthesis ?? "").trim();
        setSynthesis(text);
        if (text) patch({ strengthSynthesis: text });
        setLoaded(true);
      } catch (err) {
        console.error("[v3] synthesizeStrength failed:", err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  if (!loaded || !synthesis) {
    return <NarrationBlock text="편집장이 네 가지 재료를 한자리에 모아 천천히 꿰어보고 있어요…" />;
  }

  // Render the synthesis sentences with line breaks. We split on \n so the
  // editor's beats are visually separated within the same dialog window.
  const lines = synthesis.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      <PaginatedNarration lines={lines} pageSize={2} onAdvance={advance} />
    </div>
  );
}
