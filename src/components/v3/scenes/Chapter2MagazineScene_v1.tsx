"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * ── [v1 — 2026-05-19 백업] ────────────────────────────────────────
 * 4 BEAT 카드 vertical stack + 중앙 fold + identity 입력 + 도장이 한 페이지에
 * 다 들어가는 디자인. spread(좌·우 2면 × 3 페이지) 디자인으로 교체되며 보존용.
 * 복원: scenes/index.ts의 `chapter2Magazine` 매핑을 `Chapter2MagazineSceneV1`로.
 */
export function Chapter2MagazineSceneV1({
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

  // ── User input + judging ──────────────────────────────
  const [nameInput, setNameInput] = useState<string>(session.identityName ?? "");
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;
  const [judging, setJudging] = useState(false);
  const [editorHint, setEditorHint] = useState<string | null>(null);
  // identityName already set + non-empty? then resume into completed state.
  const [completed, setCompleted] = useState<boolean>(Boolean(session.identityName));
  const inputRef = useRef<HTMLInputElement>(null);

  // 카드+입력+도장 모두가 한 페이지에 들어가므로 dialog wrapper는 항상 content 단계.
  useEffect(() => {
    setStage("content");
  }, [setStage]);

  // Synthesis fetch (4 BEATs, ~120자 each).
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

  // BEAT 4개를 \n 으로 split. LLM이 가끔 3개나 5개 줄 수도 있으므로 slice(0,4)+pad.
  const beats = synthesis
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  // 카드 라벨 (UI 측에서 부여)
  const CARD_LABELS = ["01 · 두 몰입 순간", "02 · 공통의 결", "03 · 타인의 시선", "04 · 가치의 뿌리"];

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
        // 완성 — 이름 잠그고 도장 찍기.
        patch({ identityName: v });
        setEditorHint(null);
        setCompleted(true);
      } else {
        // 편집장 한 줄 힌트. A=추상적, B=평이한 명사.
        const hint =
          r.branch === "A"
            ? `조금 더 ${session.name}님다운 표현을 찾아볼까요? 가치 단어가 살짝 들어가도 좋아요.`
            : `그 표현은 세상에 많아요 — ${session.name}님만의 방식으로 한 번 더 적어볼까요?`;
        setEditorHint(hint);
        // 입력은 그대로 두되 포커스 복귀.
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (err) {
      console.error("[v3] judgeBranch failed:", err);
      // 안전망 — 실패 시 그냥 통과.
      patch({ identityName: v });
      setCompleted(true);
    } finally {
      setJudging(false);
    }
  };

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  // 헤드라인의 빈 줄에 들어갈 텍스트 — 입력 중인 값 또는 placeholder.
  const headlineFill = nameInput || "";
  const canSubmit = nameInput.trim().length > 0 && !judging && !completed;

  return (
    <div className="relative flex flex-1 flex-col" style={{ fontFamily: "var(--font-ridi-batang)" }}>
      {/* ── 도장 (완성 시) ───────────────────────────────── */}
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

      {/* ── 헤더 ─────────────────────────────────────────── */}
      <header className="mb-3 text-center">
        <p className="text-[11px] tracking-[0.32em] text-[#9b8768]">STORY · MAGAZINE</p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-wide text-[#3d2414]">
          Chapter 2 · 발견
        </h1>
      </header>

      {/* ── 편집자 리드 ─────────────────────────────────── */}
      <p className="mb-5 px-2 text-center text-[14px] italic leading-[1.6] text-[#5a4a36]">
        해주신 이야기를 제가 정리해봤어요.
      </p>

      {/* ── 1면 — 카드 1, 2 ───────────────────────────── */}
      <div className="space-y-3">
        {beats.slice(0, 2).map((line, i) => (
          <MagazineCard key={i} label={CARD_LABELS[i]} body={line} delay={0.1 + 0.12 * i} />
        ))}
      </div>

      {/* ── Fold ─────────────────────────────────────── */}
      <div className="my-5 flex items-center justify-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-[#b99b6b]/40" />
        <span className="text-[12px] tracking-[0.3em] text-[#9b8768]">✦</span>
        <div className="h-px flex-1 bg-[#b99b6b]/40" />
      </div>

      {/* ── 2면 — 카드 3, 4 ───────────────────────────── */}
      <div className="space-y-3">
        {beats.slice(2, 4).map((line, i) => (
          <MagazineCard key={i + 2} label={CARD_LABELS[i + 2]} body={line} delay={0.35 + 0.12 * i} />
        ))}
      </div>

      {/* ── 헤드라인 (빈 줄 — 입력으로 채워짐) ────────────── */}
      <section className="mt-7 border-t border-[#b99b6b]/30 pt-6">
        <p className="mb-3 text-center text-[11px] tracking-[0.32em] text-[#9b8768]">
          당신은 어떤 사람입니까?
        </p>
        <div className="mb-5 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span className="text-[18px] text-[#3d2414]">당신은</span>
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
            {headlineFill || "        "}
          </span>
          {/* 입력 본문 끝에 그냥 "사람."만 — 사용자가 어떤 어미("…하는",
              "…사람" 등)로 끝내든 자연스럽게 흐르도록 보조 조사 "인" 제거. */}
          <span className="text-[18px] text-[#3d2414]">사람.</span>
        </div>

        {/* ── 편집장 힌트 (judge A/B 후) ─────────────────── */}
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

        {/* ── 입력 (미완성) ───────────────────────────── */}
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
              placeholder="예: '잇는 사람' / '흩어진 걸 하나로 모으는 사람'"
              disabled={judging}
              className="w-full rounded-md border border-[#b99b6b]/50 bg-white/70 px-4 py-3 text-center text-[16px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414] disabled:opacity-50"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            />
            {/* 시도 횟수 안내 — 1회 이상 했을 때만 */}
            {attempts > 0 && attempts < MAX_ATTEMPTS && !completed && (
              <p className="mt-1.5 text-right text-[12px] text-[#9b8768]/80">
                남은 시도 {MAX_ATTEMPTS - attempts}회
              </p>
            )}
          </div>
        )}

        {/* ── 완성 시 편집장 affirmation ─────────────────── */}
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

      {/* ── 액션 버튼 ────────────────────────────────── */}
      {/*
        두 버튼에 서로 다른 `key`를 줘서 React가 별개 인스턴스로 마운트하게 함.
        StoryButtonV3 내부의 `pressed` state는 한 번 true가 되면 리셋되지 않는데
        (씬 전환으로 unmount되는 걸 전제로 만들어진 위젯), 이 씬은 같은 페이지에서
        제출 → 완성 으로 상태만 바뀌기 때문에, key를 안 주면 React가 인스턴스를
        재사용해서 pressed=true가 유지되고 다음 버튼이 영구 비활성으로 보임.
      */}
      <div className="mt-7 flex justify-center pb-2">
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

/** 한 BEAT = 한 카드. 라벨 + 본문. fade-in 스태거. */
function MagazineCard({ label, body, delay }: { label: string; body: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="rounded-md border border-[#b99b6b]/40 bg-white/55 px-5 py-4"
    >
      <p className="text-[12px] uppercase tracking-[0.24em] text-[#9b8768]">{label}</p>
      <p className="mt-2 text-[15px] leading-[1.75] text-[#3d2414]">
        <EditorialInline text={body} />
      </p>
    </motion.div>
  );
}
