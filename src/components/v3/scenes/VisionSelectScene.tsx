"use client";

import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

// Fallback 6 sentences — shown when the LLM call fails, JSON parsing fails, or
// a generated sentence is over its length cap. Mirrors the fallback in stub.ts
// so both layers surface the same defaults.
const FALLBACK_DIRECTIONS: string[] = [
  "지금 하는 일의 본질을 더 깊이 파고드는 사람",
  "나만의 방식으로 같은 일을 다르게 해내는 사람",
  "이미 가진 강점을 더 선명하게 쓰는 사람",
  "새로운 영역으로 발을 넓혀가는 사람",
  "내가 중요하다고 믿는 곳에 실질적인 변화를 만드는 사람",
  "지금 하는 일을 통해, 언젠가 내가 닿고 싶은 곳에 가는 사람",
];

/**
 * [17p] 성장 방향 선택기.
 * - 추천 문장 6개: 체크박스 다중 선택 — 참고용 표시만, textarea 자동완성 안 함
 * - 나의 성장 방향: 빈 textarea + "이걸로 할게요" 버튼
 */
export function VisionSelectScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  const [directions, setDirections] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [value, setValue] = useState(session.visionLine || "");
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    if (directions) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.generateVisionDirections({
          name: session.name,
          job: session.job,
          commonPattern: session.commonPattern,
          identityName: session.identityName,
          strengthSummary: session.strengthRevised || session.strengthCommonAsk,
          attraction: session.attraction,
          alreadyDoing: session.alreadyDoing,
          whyReason: session.whyReason,
          growthDirection: session.growthDirection,
          currentTool: session.currentTool,
          growthTool: session.growthTool,
          contribution: session.contribution,
        });
        if (cancelled) return;
        if (r.directions.length >= 6) {
          setDirections(r.directions.slice(0, 6));
        } else {
          setDirections(FALLBACK_DIRECTIONS);
          setIsFallback(true);
        }
      } catch (err) {
        console.error("[v3] generateVisionDirections failed:", err);
        if (!cancelled) {
          setDirections(FALLBACK_DIRECTIONS);
          setIsFallback(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Checking a sentence only marks it as a reference — it does NOT auto-fill
  // the textarea. The participant writes their own line below, using the
  // checked sentences as inspiration.
  const toggleCheck = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const submit = () => {
    if (!value.trim()) return;
    patch({ visionLine: value.trim() } as Partial<V3Session>);
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  if (!directions) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[14px] italic text-[#8b7050]">
          편집장이 방향들을 정리하고 있어요…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* [상단] 엘아울 멘트 */}
      <p
        className="text-[14px] leading-[1.7] text-[#3d2414]"
        style={{ fontFamily: "var(--font-ridi-batang)" }}
      >
        {session.name}님이 말해주신 것들을 바탕으로 몇 가지 문장을 만들어봤어요. 마음에 닿는
        표현에 체크해두고, 아래에 {session.name}님만의 언어로 정리해주세요.
      </p>

      {/* [중단] 추천 문장 6개 — 체크박스 (참고용, textarea 자동완성 안 함) */}
      <div className="flex flex-col gap-2">
        {isFallback && (
          <p className="text-[12px] italic text-[#a18965]">
            아래 문장을 참고해 직접 적어주세요.
          </p>
        )}
        {directions.map((text, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => toggleCheck(i)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3 }}
            className={`flex items-start gap-3 rounded-md border px-4 py-3 text-left transition ${
              checked.has(i)
                ? "border-[#3d2414]/40 bg-[#ede1c6]"
                : "border-[#b99b6b]/40 bg-white/50 hover:bg-[#f5ead6]/60"
            }`}
          >
            <span
              className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                checked.has(i) ? "border-[#3d2414] bg-[#3d2414]" : "border-[#b99b6b]"
              }`}
            >
              {checked.has(i) && (
                <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none">
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className="text-[14px] leading-[1.65] text-[#3d2414]">{text}</span>
          </motion.button>
        ))}
        <p
          className="mt-1 border-l-2 border-[#b99b6b]/50 pl-3 text-[14px] italic leading-[1.6] text-[#8b7050]"
          style={{ fontFamily: "var(--font-ridi-batang)" }}
        >
          편집장의 한마디 — 체크한 표현을 참고해서 아래에 {session.name}님의 언어로 써주세요.
        </p>
      </div>

      {/* [하단] 나의 성장 방향 */}
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-[#8b7050]">
          나의 성장 방향
        </p>
        <p className="text-[14px] text-[#a18965]">
          위에서 고른 문장들을 바탕으로, {session.name}님만의 언어로 정리해주세요. 고른 문장
          그대로여도 좋고, 합치거나 고쳐도 좋아요. {session.name}님은 어떤 방향으로 나아가고
          싶은 사람인가요?
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="위에서 체크한 표현을 참고해, 직접 적어주세요."
          rows={4}
          className="w-full resize-none rounded-md border border-[#b99b6b]/40 bg-white/60 p-3 text-[14px] leading-[1.7] text-[#3d2414] outline-none placeholder:text-[#c4a97a] focus:border-[#3d2414]"
        />
      </div>

      {/* 버튼 — sticky 하단 고정 (FULL_HEIGHT dialog의 p-7에 맞춰 -mx-7/-mb-7) */}
      <div className="sticky bottom-0 z-10 -mx-7 -mb-7 mt-1 flex justify-end border-t border-[#d7bd83]/20 bg-[#f6efdf]/95 px-7 py-3 backdrop-blur">
        <StoryButtonV3
          label={spec.buttonLabel ?? "이걸로 할게요"}
          onClick={submit}
          disabled={!value.trim()}
          ritual
        />
      </div>
    </div>
  );
}
