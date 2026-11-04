"use client";

import { useContext, useEffect } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { DialogStageContext } from "@/components/v3/V3App";
import type { StubRetryGate } from "@/lib/v3/useStubRetryGate";

/**
 * Shown instead of canned text when an AI call failed. Retry is always
 * offered; "continue" appears after one manual retry so nobody gets stuck.
 */
export function LlmRetryNotice({ gate, name }: { gate: StubRetryGate; name?: string }) {
  const { setStage } = useContext(DialogStageContext);
  useEffect(() => {
    setStage("content");
  }, [setStage]);

  const who = name ? `${name}님` : "당신";
  const text = gate.canProceed
    ? `이번에도 정리가 잘 되지 않았어요. 잠시 후 한 번 더 시도하거나, 기본 문장으로 계속 진행할 수 있어요.`
    : `편집장이 ${who}의 이야기를 정리하다가 잠시 멈췄어요. 다시 시도하면 ${who}이 해주신 이야기로 다시 정리해 드릴게요.`;

  return (
    <div className="flex flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="flex-1">
        <NarrationBlock text={text} />
      </div>
      <div className="mt-auto flex flex-wrap justify-end gap-3 pt-4">
        {gate.canProceed && (
          <StoryButtonV3 label="기본 문장으로 계속" onClick={gate.proceed} variant="tertiary" />
        )}
        <StoryButtonV3 label="다시 시도" onClick={gate.retry} />
      </div>
    </div>
  );
}
