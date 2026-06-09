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
 * ── [v2 — 2026-05-19] Chapter 2 매거진 스프레드 ──────────────────────
 *
 * C-2b(최종 합본 매거진)와 동일한 spread 디자인을 적용한 Chapter 2 종합 페이지.
 *
 * 호흡:
 *   Spread 1 — BEAT 01 두 몰입 순간 (좌) + BEAT 02 공통의 결 (우)
 *     → "다음 페이지"
 *   Spread 2 — BEAT 03 타인의 시선 (좌) + BEAT 04 가치의 뿌리 (우)
 *     → "다음 페이지"
 *   Spread 3 — 정체성 입력 ("당신은 어떤 사람입니까?" + 빈 줄 + 입력 + judge)
 *     → "이렇게 부를래요" → judge 결과 D 또는 시도 3회 소진 시 "Chapter 2 · 완성"
 *       도장 + 편집자 affirmation → "다음 페이지로"
 *
 * 이전 디자인(4 BEAT 카드 vertical stack + fold)은 Chapter2MagazineScene_v1.tsx 에
 * 보존.
 */
type Beat = { number: string; category: string; body: string; headline?: string };

// "두 몰입 순간" → "두 장면을 잇는 것"으로 변경 (2026-05-20).
// "몰입" / "Chapter 1" 같은 내부 framing 어휘를 제거하고 사용자 시점의
// 자연어("들려준 두 장면")로 통일. 매거진 한 호의 immersion 회복.
const BEAT_LABELS = [
  { number: "01", category: "두 장면을 잇는 것" },
  { number: "02", category: "공통의 결" },
  { number: "03", category: "타인의 시선" },
  { number: "04", category: "가치의 뿌리" },
];

// ── [v2 백업 — 2026-05-20] 3 spread(좌·우 2면 × 2 + 입력 1) 디자인.
// "한 판 grid" 디자인으로 교체되며 보존. 복원: scenes/index.ts의
// chapter2Magazine 매핑을 Chapter2MagazineSceneV2로.
export function Chapter2MagazineSceneV2({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  // ── LLM-loaded card content ───────────────────────────
  const [synthesis, setSynthesis] = useState<string>(session.strengthSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.strengthSynthesis));

  // ── Spread navigation (0, 1 = BEAT spreads / 2 = identity input) ─────
  const [page, setPage] = useState<0 | 1 | 2>(0);

  // ── User input + judging ──────────────────────────────
  const [nameInput, setNameInput] = useState<string>(session.identityName ?? "");
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;
  const [judging, setJudging] = useState(false);
  const [editorHint, setEditorHint] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(Boolean(session.identityName));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  // Synthesis fetch (4 BEATs).
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.synthesizeStrength({
          name: session.name,
          flowExperience1: session.flowExperience1,
          flowExperience2: session.flowExperience2,
          commonPattern: session.commonPattern,
          selectedValues: session.selectedValues
            .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
            .filter((v) => v.word.trim().length > 0),
          strengthCommonAsk: session.strengthCommonAsk,
          helpRequests: session.helpRequests,
          othersDescription: session.othersDescription,
        });
        if (cancelled) return;
        const text = (r.synthesis ?? "").trim();
        setSynthesis(text);
        if (text) patch({ strengthSynthesis: text });
        setLoaded(true);
      } catch (err) {
        console.error("[v3] synthesizeStrength failed:", err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || !synthesis) {
    return <NarrationBlock text="편집장이 이야기를 모아 천천히 꿰어보고 있어요…" />;
  }

  // Split into 4 BEATs and parse [HEADLINE: ...] from each.
  // 새 LLM 출력 형식: "[HEADLINE: H1] body1\n[HEADLINE: H2] body2\n..." (v3 톤 강화).
  // 헤드라인이 없는 옛 데이터(resume 케이스)는 자동으로 body로만 폴백.
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
    const v = nameInput.trim();
    if (!v) return;
    setJudging(true);
    setEditorHint(null);
    try {
      const r = await llm.judgeBranch({ sceneId: spec.id, answer: v });
      const next = attempts + 1;
      setAttempts(next);
      if (r.branch === "D" || next >= MAX_ATTEMPTS) {
        patch({ identityName: v });
        setEditorHint(null);
        setCompleted(true);
      } else {
        const hint =
          r.branch === "A"
            ? `조금 더 ${session.name}님다운 표현을 찾아볼까요? 가치 단어가 살짝 들어가도 좋아요.`
            : `그 표현은 세상에 많아요 — ${session.name}님만의 방식으로 한 번 더 적어볼까요?`;
        setEditorHint(hint);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (err) {
      console.error("[v3] judgeBranch failed:", err);
      patch({ identityName: v });
      setCompleted(true);
    } finally {
      setJudging(false);
    }
  };

  const advanceScene = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const scrollToTop = () => {
    const root = document.getElementById("ch2-magazine-root");
    if (root) root.scrollTop = 0;
  };

  const handleNext = () => {
    if (page < 2) {
      setPage(((page + 1) as 0 | 1 | 2));
      scrollToTop();
    } else if (completed) {
      advanceScene();
    } else {
      // page === 2 + not yet completed → submit identity
      void submit();
    }
  };

  const handlePrev = () => {
    if (page > 0) {
      setPage(((page - 1) as 0 | 1 | 2));
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
    buttonLabel = judging ? "편집장이 들여다보는 중…" : spec.buttonLabel ?? "이렇게 부를래요";
    buttonDisabled = nameInput.trim().length === 0 || judging;
  }

  const pageIndicator = `${page + 1} / 3`;
  const headlineFill = nameInput || "";

  return (
    <div
      id="ch2-magazine-root"
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {/* 완성 도장 — Spread 3에서 completed일 때만 */}
      <AnimatePresence>
        {completed && page === 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pointer-events-none absolute right-4 bottom-4 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.08em] text-[#a13c2a]/90"
          >
            CHAPTER 2 · 완성
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 매거진 마스트헤드 ──────────────────────────────────────── */}
      <header className="mb-3 shrink-0 text-center">
        <p className="text-[11px] tracking-[0.2em] text-[#7a5a3a]">
          STORY · MAGAZINE · CHAPTER 2
        </p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">
          발견
        </h1>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[12px] tracking-[0.14em] text-[#9a7b4c]">{pageIndicator}</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* 편집자 lead("해주신 이야기를 제가 정리해봤어요")는 2-7-nod 전환 비트에서
          이미 건네므로 매거진 spread 안에는 중복으로 두지 않음. */}

      {/* ── 스프레드 ───────────────────────────────────────────────── */}
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
            <IdentityPage
              name={session.name}
              headlineFill={headlineFill}
              nameInput={nameInput}
              setNameInput={setNameInput}
              completed={completed}
              attempts={attempts}
              maxAttempts={MAX_ATTEMPTS}
              editorHint={editorHint}
              inputRef={inputRef}
              onSubmit={submit}
              canSubmit={nameInput.trim().length > 0 && !judging}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── 푸터 ─────────────────────────────────────────────────── */}
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

/** Spread 3 — 정체성 입력 페이지 (당신은 ___ 사람). */
function IdentityPage({
  name,
  headlineFill,
  nameInput,
  setNameInput,
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
  nameInput: string;
  setNameInput: (v: string) => void;
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
      <p className="mb-5 text-center text-[12px] uppercase tracking-[0.2em] text-[#7a5a3a]">
        Editor&rsquo;s Question
      </p>
      <h2
        className="mb-8 text-center font-serif text-2xl italic text-[#3d2414]"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {name}님은 어떤 사람입니까?
      </h2>

      <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
        <span className="text-[18px] text-[#3d2414]">{name}님은</span>
        <span
          className={`inline-block min-w-[200px] border-b-2 border-dashed pb-1 text-[18px] font-semibold tracking-wide transition-colors ${
            completed
              ? "border-[#3d2414] text-[#3d2414]"
              : headlineFill
                ? "border-[#b99b6b] text-[#3d2414]"
                : "border-[#b99b6b]/50 text-[#b99b6b]/50"
          }`}
          style={{ fontFamily: "var(--font-ridi-batang)" }}
        >
          {headlineFill || "        "}
        </span>
        <span className="text-[18px] text-[#3d2414]">사람.</span>
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
        <div className="mx-auto max-w-[480px]">
          <input
            ref={inputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canSubmit) void onSubmit();
              }
            }}
            placeholder="예: '잇는 사람' / '흩어진 걸 하나로 모으는 사람'"
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
            <p>Chapter 2가 완성됐어요.</p>
            <p>이 이름은 오늘 STORY {name}호의 첫 페이지에 새겨질 거예요.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
