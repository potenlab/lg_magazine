"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { parseBeat } from "@/components/v3/ui/MagazineArticlePage";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * ── [v3 — 2026-05-20] Chapter 2 매거진 — 한 판 grid ────────────────────
 *
 * 사용자 피드백: spread(페이지 넘김) 대신 3-10-v1처럼 카드 전체를 한 화면 grid로
 * 보고 싶다. 그래서:
 *   - 4 BEAT 카드를 2-column grid로 한 번에 펼쳐 보여주고 (페이지네이션 X)
 *   - 그 아래에 정체성 입력(당신은 ___ 사람) + judge + 완성 도장이 같은 페이지에
 *   - 전체가 한 스크롤 영역
 *
 * 카테고리(BEAT 라벨)는 Ch2 전용(두 장면을 잇는 것/공통의 결/타인의 시선/가치의 뿌리).
 * 직전 전환 비트 2-7-nod에서 "해주신 이야기를 제가 정리해봤어요" lead를 건넴.
 *
 * spread(v2) 디자인은 Chapter2MagazineScene_v2.tsx에 보존.
 */
type Beat = { number: string; category: string; body: string; headline?: string };

const BEAT_LABELS = [
  { number: "01", category: "두 장면을 잇는 것" },
  { number: "02", category: "공통의 결" },
  { number: "03", category: "타인의 시선" },
  { number: "04", category: "가치의 뿌리" },
];

export function Chapter2MagazineScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  const [synthesis, setSynthesis] = useState<string>(session.strengthSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.strengthSynthesis));

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

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.synthesizeStrength({
          name: session.name,
          flowExperience1: session.flowExperience1,
          flowExperience2: session.flowExperience2,
          selectedValues: session.selectedValues
            .map((word) => ({ word, meaning: session.valueDefinitions[word] ?? "" }))
            .filter((v) => v.word.trim().length > 0),
          strengthCommonAsk: session.strengthCommonAsk,
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
    return <NarrationBlock text="편집장이 네 가지 재료를 한자리에 모아 천천히 꿰어보고 있어요…" />;
  }

  const beatTexts = synthesis
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const beats: Beat[] = BEAT_LABELS.map((lbl, i) => {
    const { headline, body } = parseBeat(beatTexts[i] ?? "");
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

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const canSubmit = nameInput.trim().length > 0 && !judging && !completed;
  const headlineFill = nameInput || "";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {/* 완성 도장 */}
      <AnimatePresence>
        {completed && (
          <motion.div
            initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pointer-events-none absolute right-1 top-0 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.18em] text-[#a13c2a]/90"
          >
            CHAPTER 2 · 완성
          </motion.div>
        )}
      </AnimatePresence>

      {/* 마스트헤드 */}
      <header className="mb-4 shrink-0 text-center">
        <p className="text-[11px] tracking-[0.42em] text-[#7a5a3a]">STORY · MAGAZINE · CHAPTER 2</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">발견</h1>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[12px] tracking-[0.3em] text-[#9a7b4c]">EDITOR&rsquo;S SUMMARY</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* BEAT 카드 — 한 판 2-column grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {beats.map((beat, i) => (
          <BeatCard key={i} beat={beat} delay={0.12 * i} />
        ))}
      </div>

      {/* 정체성 입력 */}
      <section className="mt-7 border-t border-[#b99b6b]/30 pt-6">
        <p className="mb-3 text-center text-[12px] uppercase tracking-[0.42em] text-[#7a5a3a]">
          Editor&rsquo;s Question
        </p>
        {/* 터세한 "님은 어떤 사람입니까?" 대신 엘아울의 따뜻한 원래 멘트(구 2-8). */}
        <p className="mb-6 text-center text-[16px] leading-[1.75] text-[#3d2414]">
          이제 {session.name}님의 차례예요.
          <br />
          방금 함께 발견한 이 모습으로, {session.name}님이 어떤 사람인지 적어주세요.
        </p>

        <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span className="text-[18px] text-[#3d2414]">{session.name}님은</span>
          <span
            className={`inline-block min-w-[200px] border-b-2 border-dashed pb-1 text-[18px] font-semibold tracking-wide transition-colors ${
              completed
                ? "border-[#3d2414] text-[#3d2414]"
                : headlineFill
                  ? "border-[#b99b6b] text-[#3d2414]"
                  : "border-[#b99b6b]/50 text-[#b99b6b]/50"
            }`}
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
                  if (canSubmit) void submit();
                }
              }}
              placeholder="예: '잇는 사람' / '흩어진 걸 하나로 모으는 사람'"
              className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
            />
            {attempts > 0 && attempts < MAX_ATTEMPTS && (
              <p className="mt-1.5 text-right text-[12px] text-[#9b8768]/80">
                남은 시도 {MAX_ATTEMPTS - attempts}회
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
              <p>이 이름은 오늘 STORY {session.name}호의 첫 페이지에 새겨질 거예요.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* 액션 버튼 */}
      <div className="mt-7 flex shrink-0 justify-center pb-2">
        {!completed ? (
          <StoryButtonV3
            key="submit"
            label={judging ? "편집장이 들여다보는 중…" : spec.buttonLabel ?? "이렇게 부를래요"}
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
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#9b8768]">
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

/** `**xxx**` → <strong>, 나머지는 EditorialInline. */
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
