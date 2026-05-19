"use client";

import { useContext, useEffect, useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

// [21p] LLM-driven WOW: reflects back the common pattern in what others
// brought to the participant ("external eye" strength reflection). The LLM
// call also computes strengthLinkedValue for downstream use (scene 2-9);
// this scene only displays the common-ask reflection.
//
// 2026-05-15: confirmation buttons removed per spec — the "이렇게 읽혀도
// 괜찮을까요? / 맞아요·조금 달라요" gate read as forced and the value-tying
// downstream beats now live in [22p] (strengthSynthesis). The scene is now
// click-to-advance like a regular narration, with `spec.next` a plain id.
export function StrengthConfirmScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [loaded, setLoaded] = useState(
    Boolean(session.strengthCommonAsk && session.strengthLinkedValue),
  );
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const hasNarration = Boolean(narration);
  const [showLines, setShowLines] = useState(!hasNarration);
  const { setStage } = useContext(DialogStageContext);

  useEffect(() => {
    if (session.strengthCommonAsk && session.strengthLinkedValue) {
      setLoaded(true);
      return;
    }
    const values = session.selectedValues
      .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
      .filter((v) => v.word.trim().length > 0);
    if (values.length === 0 || !session.helpRequests.trim()) return;
    let cancelled = false;
    (async () => {
      const r = await llm.reflectStrength({
        name: session.name,
        helpRequests: session.helpRequests,
        values,
      });
      if (cancelled) return;
      patch({ strengthCommonAsk: r.commonAsk, strengthLinkedValue: r.linkedValue });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const compact = !loaded || (!showLines && hasNarration);
    setStage(compact ? "narration" : "content");
  }, [loaded, showLines, hasNarration, setStage]);

  const advance = () => {
    // Mark the reflection as accepted for admin/data hygiene — there's no
    // longer a "조금 달라요" branch, so the only path is forward.
    if (!session.strengthConfirmed) patch({ strengthConfirmed: true });
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  if (!loaded) {
    return <NarrationBlock text="편집장이 답변을 가만히 들여다본다…" />;
  }

  if (!showLines && hasNarration && narration) {
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

  const commonAsk = session.strengthCommonAsk;

  return (
    <div className="flex flex-1 cursor-pointer flex-col" onClick={advance}>
      <div className="flex-1 space-y-4" style={{ fontFamily: "var(--font-ridi-batang)" }}>
        <p className="text-[16px] leading-[1.75] text-[#3d2414] md:text-[18px]">
          흥미롭네요. <strong>{session.name}</strong>님을 찾아온 사람들은 공통적으로 — &lsquo;
          <strong>{commonAsk}</strong>&rsquo;을 들고 왔군요.
        </p>
      </div>
      <div className="mt-auto flex items-center justify-end text-[16px] text-[#8b7050]">
        <span className="italic">다음</span>
      </div>
    </div>
  );
}
