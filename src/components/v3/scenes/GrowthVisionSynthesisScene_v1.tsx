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
 * ── [v1 — 2026-05-19 백업] ────────────────────────────────────────
 * 5 BEAT 카드를 2-column grid로 한 화면에 펼치던 디자인. spread(좌·우 2면 × 3
 * 페이지) 디자인으로 교체되며 보존용. 복원: scenes/index.ts의
 * `growthVisionSynthesis` 매핑을 `GrowthVisionSynthesisSceneV1`로 변경.
 */
export function GrowthVisionSynthesisSceneV1({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [synthesis, setSynthesis] = useState<string>(session.growthVisionSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.growthVisionSynthesis));
  const { setStage } = useContext(DialogStageContext);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.synthesizeGrowthVision({
          name: session.name,
          gender: session.gender,
          job: session.job,
          flowExperience1: session.flowExperience1,
          flowExperience2: session.flowExperience2,
          selectedValues: session.selectedValues
            .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
            .filter((v) => v.word.trim().length > 0),
          topValue: session.topValue,
          identityName: session.identityName,
          strengthSynthesis: session.strengthSynthesis,
          othersDescription: session.othersDescription,
          attraction: session.attraction,
          alreadyDoing: session.alreadyDoing,
          obstacles: session.obstacles,
          whyReason: session.whyReason,
          growthDirection: session.growthDirection,
          currentTool: session.currentTool,
          growthTool: session.growthTool,
          contribution: session.contribution,
        });
        if (cancelled) return;
        const text = (r.synthesis ?? "").trim();
        setSynthesis(text);
        if (text) patch({ growthVisionSynthesis: text });
        setLoaded(true);
      } catch (err) {
        console.error("[v3] synthesizeGrowthVision failed:", err);
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
    return (
      <NarrationBlock text="편집장이 그동안의 이야기를 한자리에 모아 매거진으로 엮고 있어요…" />
    );
  }

  // Split into beats — one paragraph per card.
  const beats = synthesis.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const CARD_LABELS = [
    "1. 두 몰입 순간",
    "2. 가치와 정체성",
    "3. 안과 밖의 시선",
    "4. 향하고 있는 길",
    "5. 닿고 싶은 끝",
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
        {beats.map((beat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 * i, duration: 0.55, ease: "easeOut" }}
            className="rounded-md border border-[#b99b6b]/40 bg-white/55 px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#9b8768]">
              {CARD_LABELS[i] ?? `BEAT ${i + 1}`}
            </p>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-[#3d2414]">
              <EditorialInline text={beat} />
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
