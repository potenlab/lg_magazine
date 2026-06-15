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

  // [wireframe Zone B — 2026-06-15] 직무 기반 트렌드 카드 3개. 6-axis 추천
  // 그리드 아래 "🦉 El Owl's Outside View" 섹션에 표시. recommendations와
  // 동일한 캐시 패턴: stub fallback일 땐 patch 생략해 재시도 가능.
  const [trendCards, setTrendCards] = useState<
    { direction: string; context: string }[]
  >(session.jobTrendCards ?? []);
  const [trendLoaded, setTrendLoaded] = useState<boolean>(
    (session.jobTrendCards ?? []).length > 0,
  );

  const [visionInput, setVisionInput] = useState<string>(session.visionLine ?? "");
  const [completed, setCompleted] = useState<boolean>(Boolean(session.visionLine));
  // 챕터 2 와 통일: "이렇게 적어볼래요" 클릭 → 짧은 대기 비트 ("편집장이
  // 들여다보는 중…") → 완성 도장 + "다음 페이지로". judging 자체는 LLM 판정이
  // 없고 (사용자 피드백: "너가 뭔데 날 판단해"), 단지 "다음 단계로 넘어간다"
  // 는 단계 전환 감을 살리기 위한 의도된 대기.
  const [judging, setJudging] = useState(false);

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
        // stub fallback일 때는 캐시 금지 — Chapter2MagazineScene 동일 사유.
        if (text && !r.fromStub) patch({ growthVisionSynthesis: text });
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

  // [wireframe Zone B — 2026-06-15] 직무 기반 트렌드 카드 fetch.
  // 직무 한 입력만 사용. stub fallback일 땐 캐시 금지 — 다른 합성과 동일 패턴.
  useEffect(() => {
    if (trendLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.generateJobTrendCards({ job: session.job });
        if (cancelled) return;
        const cards = (r.cards ?? []).filter((c) => c.direction.trim().length > 0);
        setTrendCards(cards);
        if (cards.length > 0 && !r.fromStub) patch({ jobTrendCards: cards });
        setTrendLoaded(true);
      } catch (err) {
        console.error("[v3] generateJobTrendCards failed:", err);
        if (!cancelled) setTrendLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || !synthesis) {
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

  // [2026-06-09] judgeBranch 기반 retry/hint 메커니즘 제거. 사용자 피드백:
  // "너가 뭔데 날 판단해" — 본인의 성장 방향 한 줄을 판정·재시도 강요하는
  // UX는 거슬린다. 다만 챕터 2 와 통일된 "단계 전환 감" 을 위해 의도된 1.4s
  // 대기 비트를 둔다 (LLM 판정이 아닌 timeout). 그 동안 버튼 라벨은 챕터 2 와
  // 같은 "편집장이 들여다보는 중…".
  const submit = async () => {
    if (completed || judging) return;
    const v = visionInput.trim();
    if (!v) return;
    setJudging(true);
    await new Promise((r) => setTimeout(r, 1400));
    patch({ visionLine: v });
    setJudging(false);
    setCompleted(true);
  };

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const canSubmit = visionInput.trim().length > 0 && !completed && !judging;
  const headlineFill = visionInput || "";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {/* 완성 도장은 Editor's Question 섹션 내부로 이동 — 챕터 2 와 통일된
          시각적 연결감(질문 옆에 도장)을 위해. 외곽 container 의 bottom-4 에
          두면 콘텐츠가 길어진 챕터 3 에서는 BEAT 카드 중간에 어색하게 떠 보임. */}

      <header className="mb-4 shrink-0 text-center">
        <p className="text-[14px] tracking-[0.2em] text-[#7a5a3a]">STORY · MAGAZINE · CHAPTER 3</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">향하는 길</h1>
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

      {/* ── ZONE A — 내부 발견형 (역할/방법/강점/성장/영향/통합) ────
          [2026-06-15 와이어프레임 적용]
          이전: 박스 테두리 + 2-col 카드. "고르는 UI"처럼 읽힌다는 피드백.
          이후: 박스 제거 + 라벨/본문만의 3-col 타이포 그리드. 상단 ghost
          라인이 항목을 구분하지만 카드 인상은 주지 않는다. */}
      {recommendations.length > 0 && (
        <section className="mt-8">
          <p className="mb-2 text-center text-[16px] leading-[1.6] text-[#3d2414]">
            지금까지의 이야기를 모아 — {session.name}님이 향할 수 있는 방향들을 정리해봤어요.
          </p>
          <p className="mb-6 text-center text-[14px] italic leading-[1.5] text-[#8b7050]">
            고르는 게 아니라, {session.name}님만의 한 줄을 적을 때 참고만 해주세요.
          </p>
          <p className="mb-3 text-[10.5px] uppercase tracking-[0.18em] text-[#9b8768] italic">
            엘아울이 {session.name}님의 이야기에서 읽은 언어
          </p>
          <div className="grid grid-cols-2 gap-x-5 sm:grid-cols-3">
            {recommendations.map((rec, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + 0.05 * i, duration: 0.45, ease: "easeOut" }}
                className="border-t border-[#b99b6b]/40 py-4 pr-2"
              >
                <p className="mb-2 text-[14px] font-medium uppercase tracking-[0.14em] text-[#9b8768]">
                  {RECOMMENDATION_AXES[i] ?? `방향 ${i + 1}`}
                </p>
                <p
                  className="text-[14px] leading-[1.7] text-[#3d2414]"
                  style={{ wordBreak: "keep-all" }}
                >
                  {rec}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── 디바이더 — "내 이야기 → 바깥 시선" 전환 ──────────────── */}
      {trendCards.length > 0 && (
        <div className="my-9 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#b99b6b]/40" />
          <span className="text-[14px] italic tracking-[0.15em] text-[#9b8768]">
            🦉 &nbsp;El Owl&rsquo;s Outside View
          </span>
          <div className="h-px flex-1 bg-[#b99b6b]/40" />
        </div>
      )}

      {/* ── ZONE B — 직무 기반 트렌드 카드 (3개) ─────────────────
          generateJobTrendCards 결과. 불릿 + 굵은 방향 한 줄 + 이탤릭
          맥락 한 줄의 에디터 노트 톤. LLM 실패 시 자연스럽게 사라짐. */}
      {trendCards.length > 0 && (
        <section>
          <p className="mb-3 text-[10.5px] uppercase tracking-[0.18em] text-[#9b8768] italic">
            바깥에서 포착한 시선
          </p>
          <ul className="flex flex-col">
            {trendCards.map((card, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + 0.08 * i, duration: 0.45, ease: "easeOut" }}
                className={`flex gap-4 border-t border-[#b99b6b]/40 py-5 ${
                  i === trendCards.length - 1 ? "border-b" : ""
                }`}
              >
                <span className="mt-[9px] inline-block size-1 shrink-0 rounded-full bg-[#9b8768]" />
                <div className="flex-1">
                  <p
                    className="mb-1 text-[14px] font-medium leading-[1.7] text-[#3d2414]"
                    style={{ wordBreak: "keep-all" }}
                  >
                    {card.direction}
                  </p>
                  {card.context && (
                    <p className="text-[14px] italic leading-[1.6] text-[#6b5a3e]">
                      {card.context}
                    </p>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Editor's Question — 앵커 패턴 입력 ──────────────────── */}
      <section className="relative mt-12">
        {/* 완성 도장 — Editor's Question 문구(질문 텍스트) 라인에 맞춰
            top-12 정도로 내려 배치. 챕터 2 와 같은 톤. */}
        <AnimatePresence>
          {completed && (
            <motion.div
              initial={{ opacity: 0, scale: 1.5, rotate: -16 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="pointer-events-none absolute right-2 top-12 z-10 rounded-sm border-2 border-[#a13c2a]/80 px-3 py-1 text-[14px] font-semibold tracking-[0.08em] text-[#a13c2a]/90"
            >
              CHAPTER 3 · 완성
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mb-4 text-center text-[14px] italic uppercase tracking-[0.2em] text-[#9b8768]">
          Editor&rsquo;s Question
        </p>
        <p className="mb-2 text-center text-[16.5px] font-medium leading-[1.75] text-[#3d2414]">
          이제 {session.name}님의 차례예요.
          <br />
          다가오는 5년, 앞으로 어떤 사람으로 성장하고 싶나요?
        </p>
        <p className="mb-8 text-center text-[14px] italic leading-[1.6] text-[#9b8768]">
          위의 표현을 가져와도 좋고, 합치거나 다시 써도 좋아요.
        </p>

        {/* 앵커 패턴 — "저는 앞으로 ___ 사람으로 성장하고 싶어요"
            UI 는 챕터 2 와 통일: 상단에 dashed-underline 한 줄로 입력 결과를
            미리 보여주고, 하단(!completed 일 때)에 별도 입력 필드. */}
        <div className="mb-6 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span className="text-[18px] text-[#3d2414]">저는 앞으로</span>
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
          <span className="text-[18px] text-[#3d2414]">사람으로 성장하고 싶어요.</span>
        </div>

        {!completed && (
          <div className="mx-auto max-w-[480px]">
            <input
              value={visionInput}
              onChange={(e) => setVisionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canSubmit) void submit();
                }
              }}
              placeholder="어떤 사람으로 성장하고 싶은지 자유롭게 써주세요"
              disabled={judging}
              className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            />
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
            label={judging ? "편집장이 들여다보는 중…" : spec.buttonLabel ?? "이렇게 적어볼래요"}
            onClick={() => void submit()}
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
      <p className="mt-2 text-[14px] leading-[1.7] text-[#3d2414]">
        {beat.body ? <BoldInline text={beat.body} /> : <span className="italic text-[#8b7050]">편집장이 정리하고 있어요…</span>}
      </p>
    </motion.div>
  );
}

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
