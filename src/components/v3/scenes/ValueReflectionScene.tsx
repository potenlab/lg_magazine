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
  const waitMsg = useEditorWait();
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
      setReflection(m.text);
      // stub(fromStub) 은 화면엔 보여주되 세션 캐시 금지 — 재진입 시 재호출되도록.
      if (!m.fromStub) patch({ valueReflection: m.text });
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
      // narration 은 LLM 반향 대기 무대지시. 명시적 클릭이 아닌 LLM 응답 도착 시
      // 아래 useEffect 가 자동 진행한다. 클릭이 들어와도 silent-drop 처럼 보이지
      // 않도록 canAdvance / "다음" 힌트 / 클릭 핸들러 전부 비활성.
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
  useEnterToAdvance(advance, beat === "reflection" && Boolean(reflection));

  // LLM 응답 도착 즉시 narration → reflection 자동 진행.
  // narration 은 사용자 행동이 아닌 LLM 대기 placeholder 이므로, "다음" 버튼이
  // 떠 있는데 안 눌리는 회귀(피드백) 근본 차단.
  useEffect(() => {
    if (reflection && beat === "narration") {
      setBeat("reflection");
    }
  }, [reflection, beat]);

  const canAdvance = beat === "reflection" && Boolean(reflection);

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
              {splitReadableChunks(reflectionPages[reflectionPage] ?? reflection).map((para, i) => (
                <p key={i}>
                  <EditorialInline text={para} />
                </p>
              ))}
            </motion.div>
          ) : (
            <NarrationBlock text={waitMsg} />
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
