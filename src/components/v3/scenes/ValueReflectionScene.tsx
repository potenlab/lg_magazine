"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

// Mirrors Ch1KeywordScene's structure: narration beat → LLM-resolved
// reflection beat. The reflection is generated from selectedValues +
// valueDefinitions and cached on session.valueReflection so re-entries
// don't re-fire the LLM.
type Beat = "narration" | "intro" | "reflection";
const BEAT_ORDER: Beat[] = ["narration", "intro", "reflection"];

export function ValueReflectionScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [reflection, setReflection] = useState(session.valueReflection);
  const hasNarration = Boolean(spec.narration);
  const [beat, setBeat] = useState<Beat>(hasNarration ? "narration" : "intro");
  const { setStage } = useContext(DialogStageContext);

  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const introLine = spec.lines?.[0] ? renderTemplate(spec.lines[0], session) : `${session.name}님이 적어주신 의미들을 함께 보고 있어요.`;

  useEffect(() => {
    if (session.valueReflection) return;
    const values = session.selectedValues
      .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
      .filter((v) => v.word.trim().length > 0);
    if (values.length === 0) return;
    let cancelled = false;
    (async () => {
      const m = await llm.reflectValues({ name: session.name, values });
      if (cancelled) return;
      patch({ valueReflection: m });
      setReflection(m);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStage(beat === "narration" ? "narration" : "content");
  }, [beat, setStage]);

  const advance = () => {
    const idx = BEAT_ORDER.indexOf(beat);
    if (idx < BEAT_ORDER.length - 1) {
      const nextBeat = BEAT_ORDER[idx + 1];
      if (nextBeat === "reflection" && !reflection) return;
      setBeat(nextBeat);
    } else {
      if (!reflection) return;
      if (typeof spec.next === "string") onAdvance(spec.next);
    }
  };

  const canAdvance =
    beat === "narration" ||
    beat === "intro" ||
    (beat === "reflection" && Boolean(reflection));

  return (
    <div
      className={`flex flex-1 flex-col gap-4 ${canAdvance ? "cursor-pointer" : ""}`}
      onClick={advance}
    >
      <div className="flex-1 space-y-4">
        {beat === "narration" && narration && <NarrationBlock text={narration} />}

        {beat === "intro" && (
          <p
            className="text-[16px] leading-[1.7] text-[#3d2414]"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          >
            {introLine}
          </p>
        )}

        {beat === "reflection" &&
          (reflection ? (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-[14px] font-bold leading-[1.6] text-[#3d2414] md:text-[15px]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              <EditorialInline text={reflection} />
            </motion.p>
          ) : (
            <NarrationBlock text="편집장이 적힌 의미들을 가만히 들여다본다…" />
          ))}
      </div>

      <div className="mt-auto flex justify-end text-[14px] text-[#8b7050]">
        <span className={`italic transition-opacity ${canAdvance ? "opacity-100" : "opacity-0"}`}>
          다음
        </span>
      </div>
    </div>
  );
}
