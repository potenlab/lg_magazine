"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { V3SessionProvider, useV3Session } from "@/components/v3/context/V3SessionContext";
import { useBGM } from "@/components/v3/context/BGMContext";
import { ResumeModal } from "@/components/v3/ResumeModal";
import { ChapterHeader } from "@/components/v3/ui/ChapterHeader";
import { ChapterIndexPanel } from "@/components/v3/ui/ChapterIndexPanel";
import { ProgressRail } from "@/components/v3/ui/ProgressRail";
import { OwlStage } from "@/components/v3/ui/OwlStage";
import { TimeOfDayBackground } from "@/components/v3/ui/TimeOfDayBackground";
import { SCENE_COMPONENTS } from "@/components/v3/scenes";
import { SCENES, SCENE_ORDER, SCENE_PREDECESSORS } from "@/lib/v3/scenes";
import type { SceneId, SceneKind } from "@/lib/v3/scenes/types";
import { personaConcept } from "@/concepts";

// Scene components flip this when they're rendering a narration-only stage,
// so the dialog wrapper can shrink to compact size instead of staying input-sized.
// - "content": full interactive dialog (input fields, cards, magazine).
// - "narration": compact stage-direction dialog (italic prelude).
// - "ambient": transparent dialog (no border / shadow, reduced parchment opacity)
//   so the narration sits softly over the background image.
// - "hidden": dialog wrapper fully hidden — used for cinematic ambience first-beats.
export type DialogStage = "narration" | "content" | "hidden" | "ambient";
export const DialogStageContext = createContext<{
  setStage: (s: DialogStage) => void;
}>({ setStage: () => {} });

// Scene kinds that take user input or render long-form content — dialog grows
// to fit textarea / cards / magazine article. Narration-only kinds (incl.
// ch1Keyword which only displays an LLM-generated poetic line) keep a fixed
// compact height.
const INPUT_KINDS: ReadonlySet<SceneKind> = new Set<SceneKind>([
  "question",
  "followup",
  "valueQuestion",
  "valueDef",
  "valueDefSingle",
  "valueRank",
  "patternConfirm",
  "cardChoice",
]);

const FULL_HEIGHT_KINDS: ReadonlySet<SceneKind> = new Set<SceneKind>([
  "valueCards",
  "toolSelect",
  "visionSelect",
  "timeHorizon",
  "recordPage",
  "magazineHandoff",
  "magazinePoster",
  "magazinePosterV1", // 임시 비교용 — v1 백업 디자인.
  "editorCredits",
  // 매거진 스프레드 씬들 — 좌·우 2 페이지 + 다음 페이지 흐름이라 풀-height.
  // FULL_HEIGHT_KINDS에 등록되면 (1) 자체적인 max-w/min-h 분기에 맞춰
  // 스타일링되고 (2) 다이얼로그 우상단 "이전" 전역 버튼이 자동 숨김 처리됨
  // (각 씬이 자체 footer에 ← 이전을 그리기 때문에 전역과 충돌하지 않게).
  "chapter2Magazine",
  "growthVisionSynthesis",
  // v1 백업 — URL 직접 진입으로만 비교용. 비교 끝나면 같이 제거.
  "chapter2MagazineV1",
  "growthVisionSynthesisV1",
]);

// Final-stage scenes have no meaningful "back" — by the time the magazine
// is being assembled, the participant should be moving forward. Also: these
// dialogs fill the box edge-to-edge, so an absolutely-positioned "이전"
// chip overlaps real content (e.g. Ch4 summary's "직무" label).
const HIDE_PREV_KINDS: ReadonlySet<SceneKind> = new Set<SceneKind>([
  "magazineHandoff",
  "magazinePoster",
  "editorCredits",
]);

export default function V3App() {
  return (
    <V3SessionProvider>
      <V3Inner />
    </V3SessionProvider>
  );
}

function V3Inner() {
  const { session, goto, hydrated, reset } = useV3Session();
  const { setScene: setBGM } = useBGM();
  const [showResume, setShowResume] = useState(false);
  const [activeId, setActiveId] = useState<SceneId>("intro");
  // Re-entry counter — bumped when navigating to the same scene id (used as part of motion key).
  // Stored in state (not a ref) because we read it during render for `motionKey`.
  const [reentryCount, setReentryCount] = useState<Record<SceneId, number>>({});
  // Scene history stack — supports the "이전" affordance per QA round 4.
  // Persisted to sessionStorage so a page refresh / resume doesn't wipe the
  // back-trail. Use lazy init so SSR doesn't touch storage.
  const [prevStack, setPrevStack] = useState<SceneId[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("v3-prev-stack");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SceneId[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("v3-prev-stack", JSON.stringify(prevStack));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [prevStack]);
  const [introProgressVisible, setIntroProgressVisible] = useState(false);

  // Preload all owl images once on mount so pose changes don't flash empty.
  // Now that WebP shrinks each owl from ~14MB to ~85KB, loading all 16 in
  // parallel costs only ~1.3MB total — well worth the no-flash UX.
  useEffect(() => {
    const seen = new Set<string>();
    for (const src of Object.values(personaConcept.characterImages)) {
      if (seen.has(src)) continue;
      seen.add(src);
      const img = new Image();
      img.src = src;
    }
  }, []);
  // Current dialog stage — scene components set this to "narration" when they
  // render only a stage-direction; the dialog wrapper shrinks accordingly.
  // Scene components are responsible for re-setting stage on their own mount;
  // resetting here would race with their effect (parent effects run after child).
  const [stage, setStage] = useState<DialogStage>("content");

  // Resume detection on first hydration.
  // setState is deferred via queueMicrotask to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!hydrated) return;
    // Dev affordance: ?scene=<id> jumps straight to a scene, bypassing resume.
    const sceneParam = new URLSearchParams(window.location.search).get("scene");
    if (sceneParam && SCENES[sceneParam as SceneId]) {
      queueMicrotask(() => {
        setShowResume(false);
        setActiveId(sceneParam as SceneId);
        setPrevStack([]);
      });
      return;
    }
    const id = session.lastSceneId;
    // Defensive: if the saved scene id no longer exists in SCENES (script
    // edits between sessions), reset to intro instead of trying to resume
    // into nothingness. loadSession() already filters this case for fresh
    // tab loads; this guards in-tab navigation too.
    const validResume = id && id !== "intro" && id !== "C-4" && SCENES[id];
    queueMicrotask(() => {
      if (validResume) {
        setShowResume(true);
      } else {
        if (id && id !== "intro" && !SCENES[id]) {
          reset();
        }
        setActiveId("intro");
      }
    });
  }, [hydrated]);  // eslint-disable-line react-hooks/exhaustive-deps

  const onResume = () => {
    setActiveId(session.lastSceneId);
    // NOTE: don't reset prevStack here — it's restored from sessionStorage
    // on mount so the back-trail survives a refresh. Resetting here would
    // hide the "이전" button on the resumed scene.
    setShowResume(false);
  };
  const onRestart = () => {
    reset();
    setActiveId("intro");
    setPrevStack([]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("v3-prev-stack");
      } catch {
        /* ignore */
      }
    }
    setShowResume(false);
  };

  // Ref mirrors of activeId + prevStack so handleAdvance always reads the
  // latest values regardless of closure freshness — guards against the
  // "back jumps to chapter start" bug where rapid sync advances captured a
  // stale activeId and pushed phantom entries instead of the true previous
  // scene. Synced after each render via the effect below.
  const activeIdRef = useRef(activeId);
  const prevStackRef = useRef(prevStack);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    prevStackRef.current = prevStack;
  }, [prevStack]);

  const handleAdvance = (next: SceneId) => {
    const current = activeIdRef.current;
    // Terminal: C-4 self-loop sentinel → reset back to fresh start
    if (current === "C-4" && next === "C-4") {
      reset();
      setActiveId("intro");
      setPrevStack([]);
      return;
    }
    // Re-entry: same scene id → bump counter so motion key forces remount.
    // Don't push to prev stack — would cause "이전" to land on the same scene.
    if (next === current) {
      setReentryCount((prev) => ({ ...prev, [next]: (prev[next] ?? 0) + 1 }));
    } else {
      setPrevStack((s) => {
        // Dedupe: never push the same id twice in a row. Defends against
        // double-fired onAdvance calls that would otherwise pile phantom
        // entries on the stack (rapid clicks, useEffect double-mounts in
        // strict mode, scenes that fire onAdvance from both an effect and a
        // click handler).
        if (s.length > 0 && s[s.length - 1] === current) return s;
        return [...s, current];
      });
    }
    goto(next);
    setActiveId(next);
  };

  const handlePrev = () => {
    const stack = prevStackRef.current;
    if (stack.length > 0) {
      const target = stack[stack.length - 1];
      goto(target);
      setActiveId(target);
      setPrevStack((s) => s.slice(0, -1));
      return;
    }
    // Fallback: stack empty (fresh page load before any forward navigation).
    // Walk back through the scene graph using SCENE_PREDECESSORS — for mostly
    // linear chains this gives the user a working "이전" affordance even
    // without recorded history. Picks the first predecessor when multiple
    // scenes can lead to current (branching).
    const current = activeIdRef.current;
    const candidates = SCENE_PREDECESSORS[current] ?? [];
    if (candidates.length === 0) return;
    const target = candidates[0];
    goto(target);
    setActiveId(target);
  };

  const progress = useMemo(() => {
    const activeSpec = SCENES[activeId];
    if (!activeSpec) return 0;
    const chapterSceneIds = SCENE_ORDER.filter((id) => SCENES[id]?.chapter === activeSpec.chapter);
    const idx = chapterSceneIds.indexOf(activeId);
    if (idx < 0) return 0;
    return chapterSceneIds.length <= 1 ? 1 : (idx + 1) / chapterSceneIds.length;
  }, [activeId]);

  // Compute spec + owl-pose early so hooks below stay above all conditional
  // returns (Rules of Hooks).
  const spec = SCENES[activeId];
  const motionKey = `${activeId}-${reentryCount[activeId] ?? 0}`;
  // Resolve owl pose: if scene declares an owlPool, pick stably per visit
  // (motionKey changes on re-entry → new pick). Otherwise use the static
  // `owl`. When both are present, the static `owl` joins the candidate set
  // so the designer's intended pose is still a possibility — pool only adds
  // variation, never overrides intent entirely.
  const resolvedPose = useMemo(() => {
    if (!spec) return "serious";
    const pool = spec.owlPool;
    if (pool && pool.length > 0) {
      const candidates = spec.owl
        ? Array.from(new Set([spec.owl, ...pool]))
        : pool;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return spec.owl ?? "serious";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionKey, spec]);

  // Update BGM based on current scene
  useEffect(() => {
    setBGM(spec?.bgm, spec?.chapter as number);
  }, [spec?.bgm, spec?.chapter, setBGM]);

  // Train loop ambience — 0-2(탑승)부터 C-3(작별 인사)까지. C-4(종착역)에서
  // 정지. 사용자 요청: 도착 후에도 객실 안 분위기를 유지하기 위해 train loop
  // 종료를 closing의 마지막 직전 scene까지 늦췄다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const audio = await import("@/lib/v3/audio");
      const idx = SCENE_ORDER.indexOf(activeId);
      const trainStartIdx = SCENE_ORDER.indexOf("0-2");
      const trainStopIdx = SCENE_ORDER.indexOf("C-4");
      const inTrain =
        idx >= 0 &&
        trainStartIdx >= 0 &&
        idx >= trainStartIdx &&
        (trainStopIdx < 0 || idx < trainStopIdx);
      if (cancelled) return;
      if (inTrain) {
        audio.startLoop("trainLoop", 0.25);
      } else {
        audio.stopLoop("trainLoop");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  if (!hydrated) {
    return <main className="min-h-screen bg-[#160d08]" />;
  }

  if (showResume) {
    return <ResumeModal session={session} onResume={onResume} onRestart={onRestart} />;
  }

  if (!spec) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#160d08] text-[#f5ead6]">
        <p>Scene not found: {activeId}</p>
      </main>
    );
  }

  const SceneComponent = SCENE_COMPONENTS[spec.kind];
  const chapter = spec.chapter;
  const time = spec.timeOfDay ?? "preBoard";
  const shouldShowOwl = !spec.hideOwl && !(spec.kind === "valueCards" && stage === "content");
  const canGoBack = prevStack.length > 0 || (SCENE_PREDECESSORS[spec.id]?.length ?? 0) > 0;

  // Intro scene takes over the whole screen — no chapter header / owl / paper card.
  // ProgressRail still renders so the user sees "Chapter 0 / step 1" status from page 1.
  if (spec.kind === "intro") {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#160d08] text-[#f5ead6]">
        <SceneComponent
          spec={spec}
          onAdvance={handleAdvance}
          onProgressVisibleChange={setIntroProgressVisible}
        />
        {introProgressVisible && <ProgressRail progress={progress} chapter={chapter} />}
      </main>
    );
  }

  // Record page — magazine article fills the full viewport from the top,
  // scrollable. Not anchored to the bottom like normal dialog scenes.
  if (spec.kind === "recordPage") {
    return (
      <DialogStageContext.Provider value={{ setStage }}>
      <main className="relative min-h-screen overflow-hidden bg-[#160d08] text-[#f5ead6]">
        <TimeOfDayBackground time={time} bgImage={spec.bgImage} bgColor={spec.bgColor} chapter={typeof chapter === "number" ? chapter : undefined} />
        <ChapterHeader />
        <div className="relative z-20 flex min-h-screen flex-col items-center px-5 pb-12 pt-24 lg:px-10">
          <section className="relative w-full max-w-[800px] flex-1 flex flex-col">
            <motion.div
              key={motionKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32 }}
              className="relative flex flex-1 flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 p-7 shadow-2xl"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              <SceneComponent spec={spec} onAdvance={handleAdvance} />
              {(prevStack.length > 0 || (SCENE_PREDECESSORS[spec.id]?.length ?? 0) > 0) && !HIDE_PREV_KINDS.has(spec.kind) && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute bottom-7 left-7 z-20 flex h-[44px] items-center italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414]"
                >
                  이전
                </button>
              )}
            </motion.div>
          </section>
        </div>
        <ProgressRail progress={progress} chapter={chapter} />
      </main>
      </DialogStageContext.Provider>
    );
  }

  // Chapter card — full-screen interstitial with stars + chapter title.
  // Keeps background, masthead, and ProgressRail; suppresses owl + dialog wrapper.
  if (spec.kind === "chapterCard") {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#160d08] text-[#f5ead6]">
        <TimeOfDayBackground time={time} bgImage={spec.bgImage} bgColor={spec.bgColor} chapter={typeof chapter === "number" ? chapter : undefined} />
        <ChapterHeader />
        <SceneComponent spec={spec} onAdvance={handleAdvance} />
        <ProgressRail progress={0} chapter={chapter} />
      </main>
    );
  }

  return (
    <DialogStageContext.Provider value={{ setStage }}>
    <main className="relative min-h-screen overflow-hidden bg-[#160d08] text-[#f5ead6]">
      <TimeOfDayBackground time={time} bgImage={spec.bgImage} bgColor={spec.bgColor} chapter={typeof chapter === "number" ? chapter : undefined} />
      <ChapterHeader />
      {/* key on chapter → panel remounts fresh when the chapter changes,
          resetting its open/selected state without an effect. */}
      <ChapterIndexPanel key={String(chapter)} currentChapter={chapter} />

      {/* Owl sits above the lower portion of the cabin so its head/torso clears the dialog. */}
      {shouldShowOwl && (
        <div
          className={
            spec.owlLift
              ? "pointer-events-none absolute inset-x-0 bottom-[30%] z-10 flex justify-center md:bottom-[32%]"
              : "pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center md:bottom-40"
          }
        >
          <OwlStage pose={resolvedPose} large={spec.owlLarge} />
        </div>
      )}

      <div className="relative z-20 flex min-h-screen flex-col items-center justify-end px-5 pb-12 pt-24 lg:px-10">
        <section className={`relative w-full ${spec.kind === "valueCards" && stage === "content" ? "mb-24" : "max-w-[1156px]"}`}>
          {!spec.hideSpeakerLabel && stage !== "hidden" && stage !== "ambient" && (
            <p
              className="mb-3 ml-1 text-[20px] tracking-wide text-[#e9d5a8]"
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              {spec.speakerLabel ?? "편집장 | 엘 아울"}
            </p>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={motionKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32 }}
              className={
                stage === "hidden"
                  // Cinematic ambience first-beat — dialog wrapper fully hidden.
                  // SceneComponent renders its own fullscreen overlay outside.
                  ? "hidden"
                  : stage === "ambient"
                    // Transparent dialog — no border / shadow, lower parchment opacity
                    // + backdrop blur so background image stays visible behind narration.
                    ? "relative mx-auto flex h-[240px] flex-col overflow-hidden rounded-md bg-[#f6efdf]/55 p-7 backdrop-blur-[2px]"
                    : FULL_HEIGHT_KINDS.has(spec.kind) && stage === "content"
                  ? // ── FULL_HEIGHT_KINDS 분기 — kind-specific 스타일 먼저, 그 다음 default ──
                  // 주의: 모든 kind-specific 검사는 반드시 FULL_HEIGHT_KINDS 분기 *안*에
                  // 있어야 함. 이전엔 일부가 분기 바깥(else)에 있어서 영원히 도달 못 했음.
                  spec.kind === "timeHorizon"
                    // timeHorizon은 LLM이 3줄만 채워주는 짧은 콘텐츠라 viewport
                    // 가득 채우면 빈 공간이 너무 많이 보인다. max-h로 잘리는 케이스만
                    // 보호하고 평소엔 콘텐츠에 맞춰 높이를 자동으로 줄인다.
                    ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                    : spec.kind === "valueCards"
                    // valueCards renders its own dark "menu board" container,
                    // so the dialog wrapper goes transparent — no parchment
                    // background, no border, no padding fighting the menu.
                    ? "relative mx-auto flex h-[calc(100vh_-_200px)] min-h-[300px] flex-col overflow-y-auto"
                    : spec.kind === "chapter2Magazine" || spec.kind === "growthVisionSynthesis" || spec.kind === "magazinePoster"
                    // 매거진 스프레드 씬들 — 좌·우 2 페이지가 가로로 펼쳐지므로 와이드 폭
                    // (1024px). 세 씬 모두 동일한 비율로 통일.
                    ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] min-h-[640px] w-full max-w-[1024px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                    : spec.kind === "magazineHandoff"
                    // [2026-05-20] 풀 세션이면 요약이 8~12줄로 길어져 dialog
                    // overflow-y-auto + sticky 버튼 조합에서 하단이 잘리던 회귀.
                    // overflow-hidden으로 두고, 씬 내부에서 flex-1 스크롤 영역 +
                    // 고정 푸터(register/freetext와 동일 패턴)로 처리.
                    ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] min-h-[420px] flex-col overflow-hidden rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                    : spec.kind === "editorCredits"
                    // 콘텐츠 짧은 final-stage 씬 — 콘텐츠 hug로 빈 양피지 회귀 방지.
                    ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] min-h-[420px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                    // default FULL_HEIGHT — recordPage / toolSelect / visionSelect / magazinePosterV1
                    : "relative mx-auto flex h-[calc(100vh_-_200px)] min-h-[300px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 p-7 shadow-2xl"
                  : spec.kind === "cardChoice" && stage === "content"
                    // cardChoice keeps the same bottom-anchored position +
                    // 1156px width as other dialogs, but drops the min-height
                    // so the dialog hugs the 3-choice content instead of
                    // forcing 480px of empty space + losing scroll.
                    ? "relative mx-auto flex max-h-[calc(100vh_-_220px)] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                    : INPUT_KINDS.has(spec.kind) && stage === "content"
                      ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] min-h-[360px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-[108px] shadow-2xl text-[16px]"
                      : spec.kind === "strengthSynthesis" && stage === "content"
                        // [v1 백업용] strengthSynthesis 단독 씬 — Chapter 2 통합으로
                        // 대체된 이후엔 도달 없음. 폴백 유지.
                        ? "relative mx-auto flex max-h-[calc(100vh_-_140px)] min-h-[500px] flex-col overflow-y-auto rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 px-7 pt-7 pb-7 shadow-2xl text-[16px]"
                        : "relative mx-auto flex h-[240px] flex-col overflow-hidden rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/90 p-7 shadow-2xl"
              }
              style={{ fontFamily: "var(--font-ridi-batang)" }}
            >
              {spec.kind === "toolSelect" || spec.kind === "cardChoice" || spec.kind === "timeHorizon" ? (
                <SceneComponent
                  spec={spec}
                  onAdvance={handleAdvance}
                  onPrev={handlePrev}
                  canGoBack={canGoBack}
                />
              ) : (
                <SceneComponent spec={spec} onAdvance={handleAdvance} />
              )}
              {spec.kind !== "toolSelect" && spec.kind !== "cardChoice" && !FULL_HEIGHT_KINDS.has(spec.kind) && (prevStack.length > 0 || (SCENE_PREDECESSORS[spec.id]?.length ?? 0) > 0) && !HIDE_PREV_KINDS.has(spec.kind) && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute bottom-7 left-7 z-20 flex h-[44px] items-center italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414]"
                >
                  이전
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>

      <ProgressRail progress={progress} chapter={chapter} />
    </main>
    </DialogStageContext.Provider>
  );
}
