"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

// 2-beat scene: narration → mirror. The rhetorical "예고 질문" beat from
// the spec was dropped — the participant cannot answer it, the box rendered
// large and empty, and it was unanimously felt as filler. The mirror itself
// is the climax of Ch1; clicking past it advances to the closing narration
// scene (1-5b) which handles the chapter transition.
type Beat = "narration1" | "mirror";
const BEAT_ORDER: Beat[] = ["narration1", "mirror"];

export function Ch1KeywordScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const [mirror, setMirror] = useState(session.ch1PoeticMirror);
  const [beat, setBeat] = useState<Beat>("narration1");
  const { setStage } = useContext(DialogStageContext);

  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;

  // Fire LLM mirror on mount (if not already cached on session).
  useEffect(() => {
    if (session.ch1PoeticMirror) return;
    let cancelled = false;
    (async () => {
      const m = await llm.reflectPoetic({
        name: session.name,
        storyA: session.flowExperience1,
        storyB: session.flowExperience2,
      });
      if (cancelled) return;
      patch({ ch1PoeticMirror: m });
      setMirror(m);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // narration1 is a stage direction (compact). mirror is the editorial
  // climax — content-sized so the line gets visual weight.
  useEffect(() => {
    setStage(beat === "narration1" ? "narration" : "content");
  }, [beat, setStage]);

  const advance = () => {
    const idx = BEAT_ORDER.indexOf(beat);
    if (idx < BEAT_ORDER.length - 1) {
      const nextBeat = BEAT_ORDER[idx + 1];
      // Don't allow skipping past mirror beat until LLM has resolved.
      if (nextBeat === "mirror" && !mirror) return;
      setBeat(nextBeat);
    } else {
      // Last beat (mirror) → onAdvance to next scene
      if (!mirror) return;
      if (typeof spec.next === "string") onAdvance(spec.next);
    }
  };

  const canAdvance =
    beat === "narration1" || (beat === "mirror" && Boolean(mirror));

  return (
    <div
      className={`flex flex-1 flex-col gap-4 ${canAdvance ? "cursor-pointer" : ""}`}
      onClick={advance}
    >
      <div className="flex-1 space-y-4">
        {beat === "narration1" && narration && <NarrationBlock text={narration} />}

        {beat === "mirror" && (
          mirror ? (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-[18px] font-bold leading-[1.5] text-[#3d2414] md:text-[20px]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              <EditorialInline text={mirror} />
            </motion.p>
          ) : (
            <NarrationBlock text="편집장이 두 이야기를 나란히 놓고 천천히 들여다본다…" />
          )
        )}
      </div>

      <div className="mt-auto flex justify-end text-[14px] text-[#8b7050]">
        <span className={`italic transition-opacity ${canAdvance ? "opacity-100" : "opacity-0"}`}>
          다음
        </span>
      </div>
    </div>
  );
}
