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

// 의미 입력 페이지 다음 흐름:
//   1) narration  — "편집장이 적힌 의미들을 가만히 들여다본다." (이탤릭 나레이션)
//   2) reflection — LLM 반향 (selectedValues + valueDefinitions 기반)
// reflection은 session.valueReflection에 캐시돼 재진입 시 재호출되지 않는다.
type Beat = "narration" | "reflection";

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
  const [beat, setBeat] = useState<Beat>(hasNarration ? "narration" : "reflection");
  const [reflectionPage, setReflectionPage] = useState(0);
  const { setStage } = useContext(DialogStageContext);

  // Deep mode produces a 3-paragraph reflection; paginate it across 2 pages.
  const reflectionPages = reflection ? paginateMirror(reflection) : [];

  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;

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
    setStage(beat === "narration" ? "narration" : "reflection");
  }, [beat, setStage]);

  const advance = () => {
    if (beat === "narration") {
      if (!reflection) return;
      setBeat("reflection");
      return;
    }
    // reflection 비트 — 페이지가 나뉜 반향을 먼저 넘긴 뒤 씬 전환.
    if (!reflection) return;
    if (reflectionPage < reflectionPages.length - 1) {
      setReflectionPage(reflectionPage + 1);
      return;
    }
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const canAdvance =
    beat === "narration" || (beat === "reflection" && Boolean(reflection));

  return (
    <div
      className={`flex flex-1 flex-col gap-4 ${canAdvance ? "cursor-pointer" : ""}`}
      onClick={advance}
    >
      <div className="flex-1 space-y-4">
        {beat === "narration" && narration && <NarrationBlock text={narration} />}

        {beat === "reflection" &&
          (reflection ? (
            <motion.div
              key={reflectionPage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="space-y-3 text-[16px] font-bold leading-[1.5] text-[#3d2414]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              {(reflectionPages[reflectionPage] ?? reflection).split(/\n\s*\n/).map((para, i) => (
                <p key={i}>
                  <EditorialInline text={para} />
                </p>
              ))}
            </motion.div>
          ) : (
            <NarrationBlock text="편집장이 적힌 의미들을 가만히 들여다본다…" />
          ))}
      </div>

      <div className="mt-auto flex justify-end text-[16px] text-[#8b7050]">
        <span className={`italic transition-opacity ${canAdvance ? "opacity-100" : "opacity-0"}`}>
          다음
        </span>
      </div>
    </div>
  );
}
