"use client";

import { useContext, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { parseBeats } from "@/components/v3/ui/MagazineArticlePage";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * ── [v3 — 2026-05-20] Chapter 3 매거진 — 한 판 grid ────────────────────
 *
 * 2-10과 동일하게 spread 대신 카드 전체를 한 화면 grid로. 4 BEAT 카드 grid +
 * visionLine 입력(나는 ___ 방향) + judge + 완성 도장이 같은 페이지.
 *
 * 카테고리(BEAT 라벨)는 Ch3 전용(내면의 부름/이미 시작된 움직임/안개를 걷어낼
 * 도구/종착지의 풍경). 직전 전환 비트 3-9에서 lead를 건넴.
 *
 * spread(v2) 디자인은 GrowthVisionSynthesisScene_v2.tsx에 보존.
 */
type Beat = { number: string; category: string; body: string; headline?: string };

const BEAT_LABELS = [
  { number: "01", category: "내면의 부름" },
  { number: "02", category: "이미 시작된 움직임" },
  { number: "03", category: "안개를 걷어낼 도구" },
  { number: "04", category: "종착지의 풍경" },
];

// Axis labels for the 6 personalized recommendations produced by
// v3GenerateVisionDirections. Order is fixed by that prompt's output schema:
//   1 role · 2 method · 3 strength · 4 growth · 5 impact · 6 integration
const RECOMMENDATION_AXES = [
  "역할",
  "방법",
  "강점",
  "성장",
  "영향",
  "통합",
];

export function GrowthVisionSynthesisScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  const [synthesis, setSynthesis] = useState<string>(session.growthVisionSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.growthVisionSynthesis));

  // [ch3 wow — 2026-06-09] Personalized growth-direction recommendations.
  // Shown as reference cards between the 4-BEAT grid and the Editor's Question.
  // Replaces the previous "다른 사람들은 어떤 방향을…" abstract examples modal,
  // which was reported as too generic to actually help users draft a visionLine.
  const [recommendations, setRecommendations] = useState<string[]>(
    session.growthDirectionRecommendations ?? [],
  );
  const [recLoaded, setRecLoaded] = useState<boolean>(
    (session.growthDirectionRecommendations ?? []).length > 0,
  );

  const [visionInput, setVisionInput] = useState<string>(session.visionLine ?? "");
  const [completed, setCompleted] = useState<boolean>(Boolean(session.visionLine));

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.synthesizeGrowthVision({
          name: session.name,
          gender: session.gender,
          job: session.job,
          flowExperience1: session.flowExperience1,
          flowExperience2: session.flowExperience2,
          selectedValues: session.selectedValues
            .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
            .filter((v) => v.word.trim().length > 0),
          topValue: session.topValue,
          identityName: session.identityName,
          strengthSynthesis: session.strengthSynthesis,
          othersDescription: session.othersDescription,
          attraction: session.attraction,
          alreadyDoing: session.alreadyDoing,
          obstacles: session.obstacles,
          whyReason: session.whyReason,
          growthDirection: session.growthDirection,
          currentTool: session.currentTool,
          growthTool: session.growthTool,
          contribution: session.contribution,
        });
        if (cancelled) return;
        const text = (r.synthesis ?? "").trim();
        setSynthesis(text);
        if (text) patch({ growthVisionSynthesis: text });
        setLoaded(true);
      } catch (err) {
        console.error("[v3] synthesizeGrowthVision failed:", err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch personalized direction recommendations in parallel with the BEAT
  // synthesis. Failure is silent — the section just doesn't render.
  useEffect(() => {
    if (recLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.generateVisionDirections({
          name: session.name,
          job: session.job,
          commonPattern: session.commonPattern,
          identityName: session.identityName,
          strengthSummary: session.strengthSynthesis,
          attraction: session.attraction,
          alreadyDoing: session.alreadyDoing,
          whyReason: session.whyReason,
          growthDirection: session.growthDirection,
          currentTool: session.currentTool,
          growthTool: session.growthTool,
          contribution: session.contribution,
        });
        if (cancelled) return;
        const dirs = (r.directions ?? []).map((d) => d.trim()).filter(Boolean);
        setRecommendations(dirs);
        if (dirs.length > 0) patch({ growthDirectionRecommendations: dirs });
        setRecLoaded(true);
      } catch (err) {
        console.error("[v3] generateVisionDirections failed:", err);
        if (!cancelled) setRecLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || !synthesis) {
    return (
      <NarrationBlock text="편집장이 그동안의 이야기를 한자리에 모아 매거진으로 엮고 있어요…" />
    );
  }

  const parsed = parseBeats(synthesis, 4);
  const beats: Beat[] = BEAT_LABELS.map((lbl, i) => {
    const { headline, body } = parsed[i] ?? { body: "" };
    return { ...lbl, body, headline };
  });

  // [2026-06-09] judgeBranch 기반 retry/hint 메커니즘 제거. 사용자 피드백:
  // "너가 뭔데 날 판단해" — 본인의 성장 방향 한 줄을 판정·재시도 강요하는
  // UX가 거슬린다는 의견. 이제는 입력값 그대로 저장하고 바로 완성 처리.
  const submit = () => {
    if (completed) return;
    const v = visionInput.trim();
    if (!v) return;
    patch({ visionLine: v });
    setCompleted(true);
  };

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const canSubmit = visionInput.trim().length > 0 && !completed;
  const headlineFill = visionInput || "";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      <AnimatePresence>
        {completed && (
          <motion.div
            initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.08em] text-[#a13c2a]/90"
          >
            CHAPTER 3 · 완성
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-4 shrink-0 text-center">
        <p className="text-[11px] tracking-[0.2em] text-[#7a5a3a]">STORY · MAGAZINE · CHAPTER 3</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">향하는 길</h1>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[12px] tracking-[0.14em] text-[#9a7b4c]">EDITOR&rsquo;S SUMMARY</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* BEAT 카드 — 한 판 2-column grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {beats.map((beat, i) => (
          <BeatCard key={i} beat={beat} delay={0.12 * i} />
        ))}
      </div>

      {/* ── 추천 성장 방향 (참고용) ─────────────────────────────────
          매거진 BEAT를 본 뒤 visionLine을 적기 직전, 사용자 데이터에 기반해
          개인화된 방향 6개를 참고용 카드로 보여준다. 고르는 UI가 아니라
          참고만 — 클릭/선택 인터랙션 의도적으로 제외. (LLM 실패 시 섹션
          자체가 비어 자연스럽게 사라진다.) */}
      {recommendations.length > 0 && (
        <section className="mt-7 border-t border-[#b99b6b]/30 pt-6">
          <p className="mb-2 text-center text-[12px] uppercase tracking-[0.2em] text-[#7a5a3a]">
            Editor&rsquo;s Recommendation
          </p>
          <p className="mb-1 text-center text-[16px] leading-[1.6] text-[#3d2414]">
            지금까지의 이야기를 모아 — {session.name}님이 향할 수 있는 방향들을 정리해봤어요.
          </p>
          <p className="mb-5 text-center text-[13px] italic leading-[1.5] text-[#8b7050]">
            고르는 게 아니라, {session.name}님만의 한 줄을 적을 때 참고만 해주세요.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {recommendations.map((rec, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.4, ease: "easeOut" }}
                className="rounded-md border border-[#b99b6b]/30 bg-white/40 px-3.5 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8768]">
                  {RECOMMENDATION_AXES[i] ?? `방향 ${i + 1}`}
                </p>
                <p className="mt-1 text-[14px] leading-[1.65] text-[#3d2414]">
                  {rec}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* visionLine 입력 */}
      <section className="mt-7 border-t border-[#b99b6b]/30 pt-6">
        <p className="mb-3 text-center text-[12px] uppercase tracking-[0.2em] text-[#7a5a3a]">
          Editor&rsquo;s Question
        </p>
        {/* 2-10과 톤 통일 — 엘아울의 따뜻한 멘트로. */}
        <p className="mb-2 text-center text-[16px] leading-[1.75] text-[#3d2414]">
          이제 {session.name}님의 차례예요.
          <br />
          {session.name}님은 앞으로 어떤 사람으로 성장하고 싶나요?
        </p>
        <p className="mb-6 text-center text-[14px] italic leading-[1.6] text-[#8b7050]">
          주의: 현재의 내가 아니라, 앞으로 어떤 사람이 되고 싶은지를 작성해요.
          <br />
          매거진 카드의 표현을 가져와도 좋고, 합치거나 다시 써도 좋아요.
        </p>

        <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span
            className={`inline-block min-w-[260px] border-b-2 border-dashed pb-1 text-[18px] font-semibold tracking-wide transition-colors ${
              completed
                ? "border-[#3d2414] text-[#3d2414]"
                : headlineFill
                  ? "border-[#b99b6b] text-[#3d2414]"
                  : "border-[#b99b6b]/50 text-[#b99b6b]/50"
            }`}
          >
            {headlineFill || "                "}
          </span>
          <span className="text-[18px] text-[#3d2414]">방향.</span>
        </div>

        {!completed && (
          <div className="mx-auto max-w-[520px]">
            <input
              value={visionInput}
              onChange={(e) => setVisionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canSubmit) submit();
                }
              }}
              className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
            />
            {/* [2026-06-09] judgeBranch 기반 retry/hint/카운터 + "다른 사람들은
                어떤 방향을 그렸을까요?" 모달 모두 제거. 판정 UX가 거슬린다는
                피드백("너가 뭔데 날 판단해")과 추상 예시 무용 피드백 반영. */}
          </div>
        )}

        <AnimatePresence>
          {completed && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto mt-2 max-w-[560px] space-y-1 text-center text-[15px] italic leading-[1.7] text-[#5a4a36]"
            >
              <p>Chapter 3이 완성됐어요.</p>
              <p>이 방향이 오늘 STORY {session.name}호의 비전 페이지에 새겨질 거예요.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mt-7 flex shrink-0 justify-center pb-2">
        {!completed ? (
          <StoryButtonV3
            key="submit"
            label={spec.buttonLabel ?? "이렇게 적어볼래요"}
            onClick={submit}
            disabled={!canSubmit}
            ritual
          />
        ) : (
          <StoryButtonV3 key="advance" label="다음 페이지로" onClick={advance} ritual />
        )}
      </div>
    </div>
  );
}

/** 한 판 grid용 BEAT 카드 — 번호·카테고리 + 헤드라인 + 본문(bold 지원). */
function BeatCard({ beat, delay }: { beat: Beat; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="rounded-md border border-[#b99b6b]/40 bg-white/55 px-4 py-4"
    >
      <p className="text-[11px] uppercase tracking-[0.1em] text-[#9b8768]">
        {beat.number} · {beat.category}
      </p>
      {beat.headline ? (
        <h3
          className="mt-1.5 font-serif text-[17px] italic leading-snug text-[#3d2414]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          {beat.headline}
        </h3>
      ) : null}
      <p className="mt-2 text-[14px] leading-[1.7] text-[#3d2414]">
        {beat.body ? <BoldInline text={beat.body} /> : <span className="italic text-[#8b7050]">편집장이 정리하고 있어요…</span>}
      </p>
    </motion.div>
  );
}

function BoldInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\*\*([\s\S]+)\*\*$/);
        if (m) return <strong key={i} className="font-semibold text-[#3d2414]">{m[1]}</strong>;
        return <EditorialInline key={i} text={part} />;
      })}
    </>
  );
}
