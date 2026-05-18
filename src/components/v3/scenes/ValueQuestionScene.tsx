"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { HintInput } from "@/components/v3/ui/HintInput";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

const PAGINATE_THRESHOLD = 3;

/**
 * Phase 2 Step 1 — value discovery question.
 *
 * Free-text input is the primary path. A subtle link beneath the input
 * routes to a value-card alternate scene (`spec.altNext`) for users who
 * can't think of a word. Both paths converge at the value-definition step.
 */
export function ValueQuestionScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [value, setValue] = useState("");
  const [inputReady, setInputReady] = useState(false);
  const { setStage } = useContext(DialogStageContext);

  // Detect which session field (if any) the script wants L-OWL to lightly
  // re-voice in the visible lines. Today this is always {commonPattern} for
  // 2-3a; we look for any lines containing it so future scripts can opt in.
  const rephraseField: "commonPattern" | null = useMemo(() => {
    if (spec.lines?.some((l) => l.includes("{commonPattern}"))) return "commonPattern";
    return null;
  }, [spec.lines]);

  const rawAnswer = rephraseField ? session[rephraseField] : "";
  const [rephrased, setRephrased] = useState<string | null>(null);
  const [rephraseLoading, setRephraseLoading] = useState(rephraseField !== null);

  useEffect(() => {
    if (!rephraseField) return;
    if (!rawAnswer) {
      setRephraseLoading(false);
      return;
    }
    let cancelled = false;
    setRephraseLoading(true);
    (async () => {
      try {
        const out = await llm.rephraseLight({ answer: rawAnswer, name: session.name });
        if (cancelled) return;
        setRephrased(out);
      } catch (err) {
        console.warn("[ValueQuestionScene] rephraseLight failed:", err);
        if (!cancelled) setRephrased(rawAnswer);
      } finally {
        if (!cancelled) setRephraseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rephraseField, rawAnswer, session.name]);

  const sessionForRender =
    rephraseField && rephrased
      ? ({ ...session, [rephraseField]: rephrased } as V3Session)
      : session;
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, sessionForRender));

  const usePagination = lines.length >= PAGINATE_THRESHOLD;

  const handleSettled = useCallback((isLast: boolean) => {
    if (isLast) setInputReady(true);
  }, []);

  useEffect(() => {
    setStage(inputReady ? "content" : "narration");
  }, [inputReady, setStage]);

  const submit = () => {
    if (value.trim().length === 0) return;
    // Save freetext as a single-element selectedValues array so downstream
    // valueDef / valueRank scenes (which iterate over the array) keep working.
    // Also pre-set topValue since rank step would be trivial with one option.
    const v = value.trim();
    patch({
      selectedValues: [v],
      topValue: v,
    } as Partial<V3Session>);
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const openCards = () => {
    if (typeof spec.altNext === "string") onAdvance(spec.altNext);
  };

  if (rephraseLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <NarrationBlock text="편집장이 받아 적는다…" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4">
        {usePagination ? (
          <PaginatedNarration lines={lines} onSettled={handleSettled} tight={inputReady} />
        ) : (
          <AutoFlowText lines={lines} onSettled={() => setInputReady(true)} />
        )}
        {inputReady && (
          <>
            <HintInput
              value={value}
              onChange={setValue}
              placeholder={spec.placeholder ? renderTemplate(spec.placeholder, session) : undefined}
              hint={spec.inputHint ? renderTemplate(spec.inputHint, session) : undefined}
              multiline={false}
            />
            {spec.altNext && (
              <button
                type="button"
                onClick={openCards}
                className="mt-1 text-left text-[12px] italic text-[#8b7050] transition-colors hover:text-[#3d2414] hover:underline"
                style={{ fontFamily: "var(--font-ridi-batang)" }}
              >
                마음에 닿는 단어가 잘 떠오르지 않으세요? 가치 카드를 함께 보실래요?
              </button>
            )}
          </>
        )}
      </div>
      <div
        className={`mt-auto flex justify-end transition-opacity duration-500 ${
          inputReady ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "전달하기"}
          onClick={submit}
          disabled={value.trim().length === 0}
          ritual
        />
      </div>
    </div>
  );
}
