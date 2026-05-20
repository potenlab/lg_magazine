"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { MagazineBeatPage, MagazineBeatLoading, parseBeat } from "@/components/v3/ui/MagazineArticlePage";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * ── [v4 — 2026-05-19] Chapter 3 매거진 3 spread + visionLine 입력 ─────
 *
 * 2-10 (Chapter2MagazineScene)과 동일한 3 spread 구조로 통일:
 *   - 5 BEAT → 4 BEAT (이전 BEAT 5 "닿고 싶은 끝"은 BEAT 4 "향하는 길"에 흡수)
 *   - 빈 BEAT 5 단독 페이지가 "로딩 중"처럼 보이던 문제 해결
 *
 * 호흡:
 *   Spread 1 — BEAT 01 두 몰입 순간 (좌) + BEAT 02 가치와 정체성 (우)
 *     → "다음 페이지"
 *   Spread 2 — BEAT 03 안과 밖의 시선 (좌) + BEAT 04 향하는 길 (우)
 *     → "다음 페이지"
 *   Spread 3 — "당신은 어떤 방향으로 성장하고 싶나요?" + visionLine 입력 + judge
 *     → "이렇게 적어볼래요" → judge 결과 D 또는 시도 3회 소진 시
 *       "Chapter 3 · 완성" 도장 + 편집자 affirmation → "다음 페이지로"
 *
 * 이전 디자인(5 BEAT × 4 spread)은 GrowthVisionSynthesisScene_v1.tsx에 보존.
 */
type Beat = { number: string; category: string; body: string; headline?: string };

// ── [2026-05-20] Ch3-focused 4 BEAT (Gem 6→4 merge 전략) ────────────
// Ch3 응답 6개(attraction·whyReason·alreadyDoing·obstacles·contribution +
// 객관식 growthDirection·currentTool·growthTool)를 4 BEAT에 압축.
// 객관식 선택지는 standalone 카드가 아니라 관련 텍스트 BEAT 안에 인젝션:
//   · BEAT 01 (내면의 부름) ← growthDirection
//   · BEAT 02 (이미 시작된 움직임) ← currentTool (이미 잘 쓰는 도구)
//   · BEAT 03 (안개를 걷어낼 도구) ← growthTool (배우고 싶은 도구)
//   · BEAT 04 (종착지의 풍경) ← contribution + Ch2 echo (topValue/identityName)
const BEAT_LABELS = [
  { number: "01", category: "내면의 부름" },
  { number: "02", category: "이미 시작된 움직임" },
  { number: "03", category: "안개를 걷어낼 도구" },
  { number: "04", category: "종착지의 풍경" },
];

const TOTAL_PAGES = 3 as const;
type PageIndex = 0 | 1 | 2;

// ── [v2 백업 — 2026-05-20] 3 spread(좌·우 2면 × 2 + 입력 1) 디자인.
// "한 판 grid" 디자인으로 교체되며 보존. 복원: scenes/index.ts의
// growthVisionSynthesis 매핑을 GrowthVisionSynthesisSceneV2로.
export function GrowthVisionSynthesisSceneV2({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const [synthesis, setSynthesis] = useState<string>(session.growthVisionSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.growthVisionSynthesis));
  const [page, setPage] = useState<PageIndex>(0);
  const { setStage } = useContext(DialogStageContext);

  // ── visionLine 입력 + judge ──────────────────────────────────────
  const [visionInput, setVisionInput] = useState<string>(session.visionLine ?? "");
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;
  const [judging, setJudging] = useState(false);
  const [editorHint, setEditorHint] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(Boolean(session.visionLine));
  const inputRef = useRef<HTMLInputElement>(null);

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

  if (!loaded || !synthesis) {
    return (
      <NarrationBlock text="편집장이 그동안의 이야기를 한자리에 모아 매거진으로 엮고 있어요…" />
    );
  }

  // 4 BEAT 파싱 + 각 BEAT에서 [HEADLINE: ...] 추출 (있으면).
  // 새 LLM 출력 형식과 호환 + 헤드라인 없는 옛 데이터는 body로 폴백.
  const beatTexts = synthesis
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const beats: Beat[] = BEAT_LABELS.map((lbl, i) => {
    const raw = beatTexts[i] ?? "";
    const { headline, body } = parseBeat(raw);
    return { ...lbl, body, headline };
  });

  const submit = async () => {
    if (judging || completed) return;
    const v = visionInput.trim();
    if (!v) return;
    setJudging(true);
    setEditorHint(null);
    try {
      const r = await llm.judgeBranch({ sceneId: spec.id, answer: v });
      const next = attempts + 1;
      setAttempts(next);
      if (r.branch === "D" || next >= MAX_ATTEMPTS) {
        patch({ visionLine: v });
        setEditorHint(null);
        setCompleted(true);
      } else {
        const hint =
          r.branch === "A"
            ? `조금 더 ${session.name}님다운 표현으로 — 매거진 카드의 단어를 가져와도 좋아요.`
            : `직책이나 외적인 표현보다, ${session.name}님이 향하는 결을 한 줄로 적어볼까요?`;
        setEditorHint(hint);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (err) {
      console.error("[v3] judgeBranch failed:", err);
      patch({ visionLine: v });
      setCompleted(true);
    } finally {
      setJudging(false);
    }
  };

  const advanceScene = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const scrollToTop = () => {
    const root = document.getElementById("ch3-magazine-root");
    if (root) root.scrollTop = 0;
  };

  const handleNext = () => {
    if (page < 2) {
      setPage(((page + 1) as PageIndex));
      scrollToTop();
    } else if (completed) {
      advanceScene();
    } else {
      void submit();
    }
  };

  const handlePrev = () => {
    if (page > 0) {
      setPage(((page - 1) as PageIndex));
      scrollToTop();
    }
  };

  // ── Button label / disabled per page ─────────────────────────────────
  let buttonLabel: string;
  let buttonDisabled: boolean;
  if (page < 2) {
    buttonLabel = "다음 페이지";
    buttonDisabled = false;
  } else if (completed) {
    buttonLabel = "다음 페이지로";
    buttonDisabled = false;
  } else {
    buttonLabel = judging ? "편집장이 들여다보는 중…" : spec.buttonLabel ?? "이렇게 적어볼래요";
    buttonDisabled = visionInput.trim().length === 0 || judging;
  }

  const pageIndicator = `${page + 1} / ${TOTAL_PAGES}`;
  const headlineFill = visionInput || "";

  return (
    <div
      id="ch3-magazine-root"
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {/* 완성 도장 — 마지막 Spread(입력 페이지)에서 completed일 때만 */}
      <AnimatePresence>
        {completed && page === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pointer-events-none absolute right-1 top-0 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.18em] text-[#a13c2a]/90"
          >
            CHAPTER 3 · 완성
          </motion.div>
        )}
      </AnimatePresence>

      <header className="mb-3 shrink-0 text-center">
        <p className="text-[11px] tracking-[0.42em] text-[#7a5a3a]">
          STORY · MAGAZINE · CHAPTER 3
        </p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">
          향하는 길
        </h1>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[12px] tracking-[0.3em] text-[#9a7b4c]">{pageIndicator}</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* Ch3는 전환 비트 3-9에서 이미 "여기까지 들려주신 이야기들을 한자리에
          모아보면 — 이런 방향들이 보여요." lead를 건네므로, 매거진 spread 안에는
          중복 lead를 두지 않음. */}

      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="flex-1"
        >
          {page === 0 && <BeatSpread left={beats[0]} right={beats[1]} />}
          {page === 1 && <BeatSpread left={beats[2]} right={beats[3]} />}
          {page === 2 && (
            <VisionInputPage
              name={session.name}
              headlineFill={headlineFill}
              visionInput={visionInput}
              setVisionInput={setVisionInput}
              completed={completed}
              attempts={attempts}
              maxAttempts={MAX_ATTEMPTS}
              editorHint={editorHint}
              inputRef={inputRef}
              onSubmit={submit}
              canSubmit={visionInput.trim().length > 0 && !judging}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <footer className="mt-5 flex shrink-0 items-center justify-between border-t border-[#d7bd83]/30 pt-4">
        <button
          type="button"
          onClick={handlePrev}
          disabled={page === 0}
          className="text-[14px] italic text-[#8b7050] transition hover:text-[#3d2414] disabled:opacity-30"
        >
          ← 이전
        </button>
        <StoryButtonV3
          key={`adv-${page}-${completed ? "done" : "wip"}`}
          label={buttonLabel}
          onClick={handleNext}
          disabled={buttonDisabled}
          ritual
        />
      </footer>
    </div>
  );
}

/** 좌·우 BEAT 페이지 한 spread. 모바일은 세로 스택. */
function BeatSpread({ left, right }: { left: Beat; right: Beat }) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-0">
      <BeatPanel side="left">
        {left.body ? (
          <MagazineBeatPage number={left.number} category={left.category} body={left.body} headline={left.headline} />
        ) : (
          <MagazineBeatLoading number={left.number} category={left.category} />
        )}
      </BeatPanel>
      <BeatPanel side="right">
        {right.body ? (
          <MagazineBeatPage number={right.number} category={right.category} body={right.body} headline={right.headline} />
        ) : (
          <MagazineBeatLoading number={right.number} category={right.category} />
        )}
      </BeatPanel>
    </div>
  );
}

function BeatPanel({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const fold =
    side === "left"
      ? "md:border-r md:border-[#b99b6b]/30 md:pr-7"
      : "md:pl-7";
  return <div className={`px-1 py-1 ${fold}`}>{children}</div>;
}

/** Spread 3 — visionLine 입력 (당신은 어떤 방향으로 성장하고 싶나요?). */
function VisionInputPage({
  name,
  headlineFill,
  visionInput,
  setVisionInput,
  completed,
  attempts,
  maxAttempts,
  editorHint,
  inputRef,
  onSubmit,
  canSubmit,
}: {
  name: string;
  headlineFill: string;
  visionInput: string;
  setVisionInput: (v: string) => void;
  completed: boolean;
  attempts: number;
  maxAttempts: number;
  editorHint: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void | Promise<void>;
  canSubmit: boolean;
}) {
  return (
    <section className="mx-auto max-w-[640px] py-2">
      <p className="mb-5 text-center text-[12px] uppercase tracking-[0.42em] text-[#7a5a3a]">
        Editor&rsquo;s Question
      </p>
      <h2
        className="mb-3 text-center font-serif text-2xl italic text-[#3d2414]"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {name}님은 어떤 방향으로 성장하고 싶나요?
      </h2>
      <p className="mb-7 text-center text-[14px] italic text-[#8b7050]">
        매거진 카드의 표현을 가져와도 좋고, 합치거나 다시 써도 좋아요.
      </p>

      {/* 질문 헤딩에 "방향 + 성장하고 싶나요" 모두 들어있어서, 빈 줄 라인은
          "나는" 같은 prefix 없이 간결하게 `[입력] 방향.` 만. 사용자 입력
          (예: "막막함을 풀어주는 자리에서 자기다운 빛을 내는")이 "방향"을
          직접 수식해서 한 호흡으로 읽힘. */}
      <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
        <span
          className={`inline-block min-w-[260px] border-b-2 border-dashed pb-1 text-[18px] font-semibold tracking-wide transition-colors ${
            completed
              ? "border-[#3d2414] text-[#3d2414]"
              : headlineFill
                ? "border-[#b99b6b] text-[#3d2414]"
                : "border-[#b99b6b]/50 text-[#b99b6b]/50"
          }`}
          style={{ fontFamily: "var(--font-ridi-batang)" }}
        >
          {headlineFill || "                "}
        </span>
        <span className="text-[18px] text-[#3d2414]">방향.</span>
      </div>

      <AnimatePresence>
        {editorHint && !completed && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto mb-3 max-w-[560px] text-center text-[14px] italic leading-[1.6] text-[#8b7050]"
          >
            {editorHint}
          </motion.p>
        )}
      </AnimatePresence>

      {!completed && (
        <div className="mx-auto max-w-[520px]">
          <input
            ref={inputRef}
            value={visionInput}
            onChange={(e) => setVisionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSubmit) void onSubmit();
              }
            }}
            placeholder="예: '막막함을 풀어주는 자리에서 자기다운 빛을 내는'"
            className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
            style={{ fontFamily: "var(--font-ridi-batang)" }}
          />
          {attempts > 0 && attempts < maxAttempts && (
            <p className="mt-1.5 text-right text-[12px] text-[#9b8768]/80">
              남은 시도 {maxAttempts - attempts}회
            </p>
          )}
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
            <p>이 방향이 오늘 STORY {name}호의 비전 페이지에 새겨질 거예요.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
