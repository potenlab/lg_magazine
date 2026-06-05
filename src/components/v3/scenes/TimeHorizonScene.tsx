"use client";

import { useContext, useEffect, useState } from "react";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { useEditorWait } from "@/lib/v3/useEditorWait";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

// Fallback 3 horizon sentences — shown when the LLM call / parse fails.
// Mirrors the fallback in stub.ts so both layers surface the same defaults.
const FALLBACK_HORIZON: string[] = [
  "1년 안에, 지금 하고 싶은 것을 한 발짝 더 실행해보는 사람",
  "3년 후에, 내가 원하는 방향으로 실질적으로 이동해 있는 사람",
  "언젠가, 내 방식으로 세상에 닿는 일을 하고 있는 사람",
];

const HORIZON_LABELS = ["①", "②", "③"] as const;

/**
 * [18p] 시간 지평 페이지.
 * - LLM이 참가자의 "나의 성장 방향"(visionLine)을 1년 / 3년 / 언젠가로 펼침
 * - 3개 문장을 수정 가능한 입력창에 미리 채워줌 — 그대로 둬도, 고쳐도 OK
 * - 확정값은 session.timeHorizon (string[3])에 저장
 */
export function TimeHorizonScene({
  spec,
  onAdvance,
  onPrev,
  canGoBack,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
  onPrev?: () => void;
  canGoBack?: boolean;
}) {
  const { session, patch } = useV3Session();
  const waitMsg = useEditorWait();
  const { setStage } = useContext(DialogStageContext);

  // Resume support: if the participant already finished this scene, reuse
  // their edited lines instead of regenerating.
  const [horizon, setHorizon] = useState<string[] | null>(
    session.timeHorizon.length === 3 ? session.timeHorizon : null,
  );
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    if (horizon) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.generateTimeHorizon({
          name: session.name,
          job: session.job,
          visionLine: session.visionLine,
          attraction: session.attraction,
          contribution: session.contribution,
        });
        if (cancelled) return;
        if (r.horizon.length >= 3) {
          setHorizon(r.horizon.slice(0, 3));
        } else {
          setHorizon(FALLBACK_HORIZON);
          setIsFallback(true);
        }
      } catch (err) {
        console.error("[v3] generateTimeHorizon failed:", err);
        if (!cancelled) {
          setHorizon(FALLBACK_HORIZON);
          setIsFallback(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateLine = (i: number, text: string) => {
    setHorizon((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = text;
      return next;
    });
  };

  const canSubmit = !!horizon && horizon.every((h) => h.trim().length > 0);

  const submit = () => {
    if (!horizon || !canSubmit) return;
    patch({ timeHorizon: horizon.map((h) => h.trim()) } as Partial<V3Session>);
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  if (!horizon) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[16px] italic text-[#8b7050]">
          {waitMsg}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 엘아울 멘트 */}
      <p
        className="text-[16px] leading-[1.7] text-[#3d2414]"
        style={{ fontFamily: "var(--font-ridi-batang)" }}
      >
        {session.name}님이 정한 방향을 시간 위에 펼쳐봤어요.
      </p>

      {/* 시간 지평 3개 — 수정 가능한 입력창 (LLM이 미리 채움) */}
      <div className="flex flex-col gap-3">
        {isFallback && (
          <p className="text-[16px] italic text-[#a18965]">
            아래 문장을 참고해 직접 고쳐주세요.
          </p>
        )}
        {horizon.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2 text-[16px] text-[#a18965]">{HORIZON_LABELS[i]}</span>
            <textarea
              value={line}
              onChange={(e) => updateLine(i, e.target.value)}
              rows={2}
              className="flex-1 resize-none rounded-md border border-[#b99b6b]/40 bg-white/60 p-3 text-[16px] leading-[1.6] text-[#3d2414] outline-none focus:border-[#3d2414]"
            />
          </div>
        ))}
        <p
          className="border-l-2 border-[#b99b6b]/50 pl-3 text-[16px] italic leading-[1.6] text-[#8b7050]"
          style={{ fontFamily: "var(--font-ridi-batang)" }}
        >
          편집장의 한마디 — 이대로여도 좋고, 고쳐도 좋아요. {session.name}님만의 언어로 성장
          로드맵을 세워주세요.
        </p>
      </div>

      {/* 이전 + 이걸로 할게요 — 같은 row에 정렬 (ToolSelectScene 패턴) */}
      <div className="sticky bottom-0 z-10 -mx-7 -mb-7 mt-1 flex items-center justify-between px-7 py-3">
        {onPrev && canGoBack ? (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-[44px] items-center italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414]"
          >
            이전
          </button>
        ) : (
          <span />
        )}
        <StoryButtonV3
          label={spec.buttonLabel ?? "이걸로 할게요"}
          onClick={submit}
          disabled={!canSubmit}
          ritual
        />
      </div>
    </div>
  );
}
