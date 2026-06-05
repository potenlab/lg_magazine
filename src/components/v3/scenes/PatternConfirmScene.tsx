"use client";

import { useContext, useEffect, useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { PaginatedNarration } from "@/components/v3/ui/PaginatedNarration";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { useEditorWait } from "@/lib/v3/useEditorWait";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function PatternConfirmScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const waitMsg = useEditorWait();
  const [loaded, setLoaded] = useState(false);
  const [narrationDone, setNarrationDone] = useState(false);

  useEffect(() => {
    if (session.patternMirrorSituation && session.patternMirrorBehavior) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await llm.observePattern({
        name: session.name,
        storyA: session.flowExperience1,
        storyB: session.flowExperience2,
        selectedValue: session.topValue,
        valueDef: session.valueDefinitions[session.topValue] ?? "",
      });
      if (cancelled) return;
      patch({ patternMirrorSituation: r.situationPattern, patternMirrorBehavior: r.behaviorPattern });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const [showLines, setShowLines] = useState(!narration);
  const { setStage } = useContext(DialogStageContext);
  useEffect(() => {
    // Compact while LLM is fetching the pattern OR while showing the
    // italic narration prelude — both render only one or two italic lines
    // and shouldn't claim the full input-sized dialog box.
    const compact = !loaded || (!showLines && narration);
    setStage(compact ? "narration" : "content");
  }, [loaded, showLines, narration, setStage]);

  const resolveNext = (confirmedNow: boolean): SceneId | undefined => {
    if (typeof spec.next === "function") {
      return spec.next({ ...session, patternConfirmed: confirmedNow });
    }
    return typeof spec.next === "string" ? spec.next : undefined;
  };

  const accept = () => {
    patch({ patternConfirmed: true });
    const target = resolveNext(true);
    if (target) onAdvance(target);
  };
  const reject = () => {
    patch({ patternConfirmed: false });
    const target = resolveNext(false);
    if (target) onAdvance(target);
  };

  if (!loaded) {
    return <NarrationBlock text={waitMsg} />;
  }

  if (!showLines && narration) {
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col"
        onClick={() => setShowLines(true)}
      >
        <div className="flex-1">
          <NarrationBlock text={narration} />
        </div>
        <div className="mt-auto flex items-center justify-end text-[16px] text-[#8b7050]">
          <span className="italic">다음</span>
        </div>
      </div>
    );
  }

  if (!narrationDone) {
    // Each line lands on its own page so long mirror quotes don't crowd the
    // dialog. Final page click → setNarrationDone → show mirror box + buttons.
    return (
      <div className="flex flex-1 flex-col">
        <PaginatedNarration
          lines={lines}
          pageSize={spec.pageSize ?? 1}
          onAdvance={() => setNarrationDone(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5">
        <div className="rounded-md border border-[#b99b6b]/40 bg-white/40 p-4">
          <p className="text-sm text-[#3d2414]">
            {session.name}님은 <strong>{session.patternMirrorSituation}</strong>에서,{" "}
            <strong>{session.patternMirrorBehavior}</strong> 유독 에너지가 생기는 것 같아요.
          </p>
          <p className="mt-2 text-sm text-[#3d2414]">맞나요?</p>
        </div>
      </div>
      <div className="mt-auto flex justify-end gap-3">
        <StoryButtonV3 label="조금 달라요" onClick={reject} ritual />
        <StoryButtonV3 label="맞아요" onClick={accept} ritual />
      </div>
    </div>
  );
}
