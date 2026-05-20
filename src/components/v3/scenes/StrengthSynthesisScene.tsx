"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
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
          commonPattern: session.commonPattern,
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

  // Split LLM output into separate "beats" — each beat will land in its
  // own card so the editor's WOW reads as a poster summary instead of a
  // 4-line paragraph.
  const lines = synthesis.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const CARD_LABELS = [
    "1.두 몰입 순간",
    "2.공통 결",
    "3.타인의 시선",
    "4.가치의 뿌리",
  ];

  return (
    <div
      className="flex flex-1 cursor-pointer flex-col"
      onClick={advance}
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      <p className="mb-4 text-[16px] leading-[1.7] text-[#3d2414]">
        해주신 이야기를 제가 정리해봤어요.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 * i, duration: 0.5, ease: "easeOut" }}
            className="rounded-md border border-[#b99b6b]/40 bg-white/55 px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#9b8768]">
              {CARD_LABELS[i] ?? `BEAT ${i + 1}`}
            </p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-[#3d2414]">
              <EditorialInline text={line} />
            </p>
          </motion.div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-end pt-4 text-[14px] text-[#8b7050]">
        <span className="italic">다음</span>
      </div>
    </div>
  );
}
