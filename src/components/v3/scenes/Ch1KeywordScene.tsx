"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { paginateMirror } from "@/lib/v3/paginateMirror";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

// 2-beat scene: narration → mirror. The rhetorical "예고 질문" beat from
// the spec was dropped — the participant cannot answer it, the box rendered
// large and empty, and it was unanimously felt as filler. The mirror itself
// is the climax of Ch1; clicking past it advances to the closing narration
// scene (1-5b) which handles the chapter transition.
//
// The mirror runs long in deep mode (3-paragraph editor sketch). paginateMirror
// (shared util) splits it across 2 dialog pages so neither page is a dense
// block; a default 1-paragraph mirror stays on one page.
type Beat = "narration1" | "mirror";

export function Ch1KeywordScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const [mirror, setMirror] = useState(session.ch1PoeticMirror);
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  // Skip the narration1 beat entirely if no narration is provided — the
  // stage-direction line was moved into the preceding 1-4z owlNarration
  // scene, so this scene now only renders the LLM mirror.
  const [beat, setBeat] = useState<Beat>(narration ? "narration1" : "mirror");
  const [mirrorPage, setMirrorPage] = useState(0);
  const { setStage } = useContext(DialogStageContext);

  const mirrorPages = mirror ? paginateMirror(mirror) : [];

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
    setStage(beat === "narration1" ? "narration" : "reflection");
  }, [beat, setStage]);

  const advance = () => {
    if (beat === "narration1") {
      // Don't allow skipping to the mirror until the LLM has resolved.
      if (!mirror) return;
      setBeat("mirror");
      return;
    }
    // beat === "mirror" — page through the mirror, then advance the scene.
    if (!mirror) return;
    if (mirrorPage < mirrorPages.length - 1) {
      setMirrorPage(mirrorPage + 1);
      return;
    }
    if (typeof spec.next === "string") onAdvance(spec.next);
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
              key={mirrorPage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="whitespace-pre-line text-[16px] font-bold leading-[1.6] text-[#3d2414] md:text-[16px]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              <EditorialInline text={mirrorPages[mirrorPage] ?? mirror} />
            </motion.p>
          ) : (
            <NarrationBlock text="편집장이 두 이야기를 나란히 놓고 천천히 들여다본다…" />
          )
        )}
      </div>

      <div className="mt-auto flex justify-end text-[16px] text-[#8b7050]">
        <span className={`italic transition-opacity ${canAdvance ? "opacity-100" : "opacity-0"}`}>
          다음
        </span>
      </div>
    </div>
  );
}
