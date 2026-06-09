"use client";

import { useContext, useEffect, useRef, useState } from "react";
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

const VISION_EXAMPLES = [
  "막막함을 풀어주는 자리에서 자기다운 빛을 내는",
  "복잡한 문제 앞에서 길을 짚고, 함께 가는 사람들에게 자리를 만들어 주는",
  "낯선 곳에서도 자기 페이스로 배우며 다음 한 걸음을 짚어가는",
  "흩어진 정보 사이에서 맥락을 잇고, 그 다리를 후배에게 건네주는",
  "내가 짠 판 위에서 후배가 자기 결정을 내릴 수 있게, 무대를 만들어 주는",
  "한 번의 시도가 어떤 흔적을 남기는지 끝까지 지켜보는, 단단한 직업인이 되는",
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

  const [visionInput, setVisionInput] = useState<string>(session.visionLine ?? "");
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;
  const [judging, setJudging] = useState(false);
  const [editorHint, setEditorHint] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(Boolean(session.visionLine));
  const [examplesOpen, setExamplesOpen] = useState(false);
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

  const parsed = parseBeats(synthesis, 4);
  const beats: Beat[] = BEAT_LABELS.map((lbl, i) => {
    const { headline, body } = parsed[i] ?? { body: "" };
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
            : `직책이나 외적인 표현보다, ${session.name}님이 향하는 방향을 한 줄로 적어볼까요?`;
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

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const canSubmit = visionInput.trim().length > 0 && !judging && !completed;
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
                  if (canSubmit) void submit();
                }
              }}
              className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
            />
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => setExamplesOpen(true)}
                className="text-[14px] text-[#8a7a68] underline decoration-[#8a7a68]/40 underline-offset-[3px] transition hover:text-[#3d2414] hover:decoration-[#3d2414] md:text-[16px]"
              >
                다른 사람들은 어떤 방향을 그렸을까요?
              </button>
            </div>
            {attempts > 0 && attempts < MAX_ATTEMPTS && (
              <p className="mt-1.5 text-right text-[12px] text-[#9b8768]/80">
                남은 시도 {MAX_ATTEMPTS - attempts}회
              </p>
            )}
          </div>
        )}

        {/* Examples modal — 인풋 아래 텍스트 버튼으로 열림. Ch2 정체성 예시 모달과 동일한
            디자인 패턴(승객명부의 "다른 승객들은 ..."와 매칭). 백드롭/× 클릭으로 닫힘. */}
        <AnimatePresence>
          {examplesOpen && (
            <motion.div
              key="vision-examples-modal"
              className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setExamplesOpen(false)}
                className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="다른 사람들의 성장 방향 예시"
                className="relative z-10 flex max-h-[80vh] w-full max-w-[480px] flex-col overflow-hidden rounded-md border border-[#d7bd83]/40 bg-[#f6efdf] shadow-2xl"
                style={{ fontFamily: "var(--font-ridi-batang)" }}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 8, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div className="shrink-0 flex items-start justify-between gap-3 px-6 pt-6">
                  <div>
                    <p className="text-[14px] uppercase tracking-[0.08em] text-[#7a5a3a]">
                      From other passengers
                    </p>
                    <h2 className="mt-1 text-[16px] font-semibold text-[#3d2414]">
                      다른 사람들은 어떤 방향을 그렸을까요?
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExamplesOpen(false)}
                    aria-label="닫기"
                    className="-mr-1 -mt-1 rounded p-1 text-[18px] leading-none text-[#8a7a68] transition hover:text-[#3d2414]"
                  >
                    ×
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-2.5">
                    {VISION_EXAMPLES.map((ex, i) => (
                      <div
                        key={i}
                        className="block w-full rounded-md border border-[#8c785a]/25 bg-white/40 p-3 text-left"
                      >
                        <p className="text-[16px] leading-[1.55] text-[#5a4a38]">
                          {i + 1}. {ex}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="shrink-0 px-6 pb-5 text-center text-[16px] italic text-[#8a7a68]">
                  참고용 예시입니다. 내 방향은 직접 입력해주세요.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
            label={judging ? "편집장이 들여다보는 중…" : spec.buttonLabel ?? "이렇게 적어볼래요"}
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
