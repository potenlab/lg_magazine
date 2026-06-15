"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { useEditorWait } from "@/lib/v3/useEditorWait";
import { useEnterToAdvance } from "@/lib/v3/useEnterToAdvance";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { paginateMirror, splitReadableChunks } from "@/lib/v3/paginateMirror";
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
  const waitMsg = useEditorWait();
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
      // narration1 은 LLM 대기 무대지시("편집장이 가만히 들여다본다…").
      // 명시적 클릭으로 넘어가는 게 아니라 LLM 응답 도착 시 아래 useEffect 가
      // 자동 진행한다. 클릭 들어와도 silent-drop 처럼 보이지 않도록 캔어드밴스
      // 자체를 false 로 둬 클릭 핸들러 / 다음 힌트가 표시되지 않게 함.
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
  useEnterToAdvance(advance, beat === "mirror" && Boolean(mirror));

  // LLM 응답이 도착하는 즉시 narration1 → mirror 비트로 자동 진행.
  // narration1 은 사용자 행동이 아닌 LLM 대기 placeholder 이므로, "다음" 버튼이
  // 회색으로 떠 있는데 안 눌리는 회귀(피드백: "다음 버튼은 있는데 LLM 반향 때문에
  // 안 넘어가지는 경우가 있어 — 오류처럼 보임")를 근본적으로 차단.
  useEffect(() => {
    if (mirror && beat === "narration1") {
      setBeat("mirror");
    }
  }, [mirror, beat]);

  const canAdvance = beat === "mirror" && Boolean(mirror);

  return (
    <div
      className={`flex flex-1 flex-col gap-4 ${canAdvance ? "cursor-pointer" : ""}`}
      onClick={advance}
    >
      <div className="flex-1 space-y-4">
        {beat === "narration1" && narration && <NarrationBlock text={narration} />}

        {beat === "mirror" && (
          mirror ? (
            <motion.div
              key={mirrorPage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="space-y-3 text-[16px] font-bold leading-[1.5] text-[#3d2414]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              {splitReadableChunks(mirrorPages[mirrorPage] ?? mirror).map((para, i) => (
                <p key={i}>
                  <EditorialInline text={para} />
                </p>
              ))}
            </motion.div>
          ) : (
            <NarrationBlock text={waitMsg} />
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
