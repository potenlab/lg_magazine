"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { parseBeats } from "@/components/v3/ui/MagazineArticlePage";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { useEditorWait } from "@/lib/v3/useEditorWait";
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
 * 카테고리(BEAT 라벨)는 Ch2 전용(두 장면을 잇는 것/나의 강점/타인의 시선/가치의 뿌리).
 * 직전 전환 비트 2-7-nod에서 "해주신 이야기를 제가 정리해봤어요" lead를 건넴.
 *
 * spread(v2) 디자인은 Chapter2MagazineScene_v2.tsx에 보존.
 */
type Beat = { number: string; category: string; body: string; headline?: string };

const BEAT_LABELS = [
  { number: "01", category: "두 장면을 잇는 것" },
  { number: "02", category: "나의 강점" },
  { number: "03", category: "타인의 시선" },
  { number: "04", category: "가치의 뿌리" },
];

const IDENTITY_EXAMPLES = [
  "호기심이 많고 꼭 검색해보고 이해해야만 하는 사람",
  "복잡한 구조 속에서도 관계를 쉽게 파악하고, 누구나 쉽게 이해할 수 있게 설명해주는 걸 잘하는 사람",
  "사람들을 좋아하고 서로 다른 색깔을 가진 사람들이 조화롭게 어우러지도록, 경험을 설계하는 걸 좋아하는 사람",
  "막막한 일 앞에서 길을 찾아내고, 끝까지 손에 쥐고 마무리하는 사람",
  "처음 만나는 사람과도 안전한 공기를 만들어, 진짜 이야기가 흘러나오게 하는 사람",
  "팀이 흩어져 있을 때 묵묵히 다리를 놓고, 같이 가는 방향을 다시 비추는 사람",
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
  const waitMsg = useEditorWait();

  const [synthesis, setSynthesis] = useState<string>(session.strengthSynthesis);
  const [loaded, setLoaded] = useState<boolean>(Boolean(session.strengthSynthesis));

  const [nameInput, setNameInput] = useState<string>(session.identityName ?? "");
  const [completed, setCompleted] = useState<boolean>(Boolean(session.identityName));
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
        // stub fallback(`fromStub: true`)일 때는 캐시 금지 — 일반 템플릿이
        // 세션에 박혀버리면 사용자가 재진입해도 LLM을 다시 호출하지 못하고
        // 영구히 stub 출력만 보게 됨. 실제 LLM 응답만 저장.
        if (text && !r.fromStub) patch({ strengthSynthesis: text });
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
    // 매거진 도출 직전 버퍼는 LLM synthesis 호출이라 일반 응답보다 훨씬 오래
    // 걸린다. 풀에서 랜덤한 짧은 멘트(`waitMsg`)를 띄우면 사용자가 멈춘 줄
    // 알기 쉬워, 명확히 "모으는 중 / 기다려주세요" 톤의 전용 문구로 교체.
    void waitMsg;
    return (
      <NarrationBlock
        text={`편집장이 ${session.name}님이 해주신 이야기를 모아보고 있어요. 잠시만 기다려주세요.`}
      />
    );
  }

  const parsed = parseBeats(synthesis, 4);
  const beats: Beat[] = BEAT_LABELS.map((lbl, i) => {
    const { headline, body } = parsed[i] ?? { body: "" };
    return { ...lbl, body, headline };
  });

  // 2026-06-15 — judgeBranch retry/hint 제거. 사용자가 적은 표현은 그대로
  // 받아들이고 완성 도장 + 다음 페이지로 이동. "조금 더 ~다운 표현을 찾아볼까요?"
  // 같은 재질문 패턴은 사용자가 자기 표현을 의심하게 만들 수 있어 삭제.
  const submit = () => {
    if (completed) return;
    const v = nameInput.trim();
    if (!v) return;
    patch({ identityName: v });
    setCompleted(true);
  };

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const canSubmit = nameInput.trim().length > 0 && !completed;
  const headlineFill = nameInput || "";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {/* 마스트헤드 */}
      <header className="mb-4 shrink-0 text-center">
        <p className="text-[14px] tracking-[0.2em] text-[#7a5a3a]">STORY · MAGAZINE · CHAPTER 2</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">발견</h1>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[14px] tracking-[0.14em] text-[#9a7b4c]">EDITOR&rsquo;S SUMMARY</span>
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
      <section className="relative mt-7 border-t border-[#b99b6b]/30 pt-6">
        {/* 완성 도장 — Editor's Question 라인 높이에 맞춰 섹션 우상단에 anchor. */}
        <AnimatePresence>
          {completed && (
            <motion.div
              initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="pointer-events-none absolute right-2 top-12 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.08em] text-[#a13c2a]/90"
            >
              CHAPTER 2 · 완성
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mb-3 text-center text-[14px] uppercase tracking-[0.2em] text-[#7a5a3a]">
          Editor&rsquo;s Question
        </p>
        {/* 터세한 "님은 어떤 사람입니까?" 대신 엘아울의 따뜻한 원래 멘트(구 2-8). */}
        <p className="mb-6 text-center text-[16px] leading-[1.75] text-[#3d2414]">
          이제 {session.name}님의 차례예요.
          <br />
          함께 발견한 이 모습을 참고해서, 지금의 {session.name}님은 어떤 사람인지 적어주세요.
        </p>

        <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span className="text-[18px] text-[#3d2414]">나는</span>
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

        {!completed && (
          <div className="mx-auto max-w-[480px]">
            <input
              ref={inputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canSubmit) submit();
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
                다른 분들은 자신을 어떻게 정의했을까요?
              </button>
            </div>
          </div>
        )}

        {/* Examples modal — 인풋 아래 텍스트 버튼으로 열림. 다른 참가자의 정체성 문장
            예시를 보여주는 read-only 참고용. 백드롭 또는 × 클릭으로 닫힘. */}
        <AnimatePresence>
          {examplesOpen && (
            <motion.div
              key="identity-examples-modal"
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
                aria-label="다른 사람들의 정체성 예시"
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
                    <h2 className="mt-1 text-[18px] font-semibold text-[#3d2414]">
                      다른 분들은 자신을 어떻게 정의했을까요?
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
                    {IDENTITY_EXAMPLES.map((ex, i) => (
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
                  참고용 예시입니다. 내 정의는 직접 입력해주세요.
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
            label={spec.buttonLabel ?? "이렇게 부를래요"}
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
      <p className="text-[14px] uppercase tracking-[0.1em] text-[#9b8768]">
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
      {beat.body ? (
        splitIntoParagraphs(beat.body).map((para, idx) => (
          <p
            key={idx}
            className={`text-[14px] leading-[1.7] text-[#3d2414] ${idx === 0 ? "mt-2" : "mt-2.5"}`}
          >
            <BoldInline text={para} />
          </p>
        ))
      ) : (
        <p className="mt-2 text-[14px] leading-[1.7] text-[#3d2414]">
          <span className="italic text-[#8b7050]">편집장이 정리하고 있어요…</span>
        </p>
      )}
    </motion.div>
  );
}

/** 한 BEAT 본문이 너무 길게 한 덩어리로 흐르는 걸 막기 위해, 한글 종결어미 기준으로
 *  문장을 끊고 3문장마다 한 번 문단 나눔을 준다. `**bold**` 토큰은 문장 안쪽에만
 *  존재한다는 LLM 출력 패턴을 가정하므로, 분리해도 강조 마크업이 깨지지 않는다. */
function splitIntoParagraphs(text: string, sentencesPerPara = 3): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // 종결어미 + 마침표/물음표/느낌표 뒤가 문장 경계.
  const SENTENCE_END = /([^\n]*?[.!?。！？])(\s+|$)/g;
  const sentences: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_END.exec(trimmed)) !== null) {
    sentences.push(m[1]);
    last = SENTENCE_END.lastIndex;
  }
  if (last < trimmed.length) sentences.push(trimmed.slice(last).trim());
  if (sentences.length <= sentencesPerPara) return [trimmed];

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerPara) {
    paragraphs.push(sentences.slice(i, i + sentencesPerPara).join(" ").trim());
  }
  return paragraphs;
}

/** `**xxx**` → <strong>, 나머지는 EditorialInline. */
function BoldInline({ text }: { text: string }) {
  // LLM이 종종 마침표 직후에 **bold** 강조를 공백 없이 붙여 쓴다
  // ("것.**두려움보다는...**"). 시작 ** 앞에 공백을 보장해 자연스럽게
  // 흐르게. (종료 측은 조사가 바로 붙는 경우가 정상이라 건드리지 않음.)
  const spaced = text.replace(/(\S)(\*\*[^*]+\*\*)/g, "$1 $2");
  const parts = spaced.split(/(\*\*[^*]+\*\*)/g);
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
