"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { useBGM } from "@/components/v3/context/BGMContext";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { NavText } from "@/components/v3/ui/NavText";
import { VolumeControl } from "@/components/v3/ui/VolumeControl";
import { personaConcept } from "@/concepts";
import * as audio from "@/lib/v3/audio";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

type Phase = "envelope" | "letter" | "register" | "freetext" | "cover";

// New v3 image set (2026-05-06): editor's desk for envelope/letter, station
// interior for the form pages, arriving train for the cover reveal.
const INTRO_BG = "/vision_express/common/table.webp";
const BG_STATION = "/vision_express/common/inside-station.webp";
const BG_TRAIN = "/vision_express/common/arriving-train.webp";

// Envelope + letter PNGs are shared with v1 (still in /common/). Letter
// paper bumped to ver2 (2026-05-15) so the 3-page click-through reads on
// the new editor-table letterhead.
const INVITE_LETTER = personaConcept.commonImages.inviteLetter;
const LETTER_UNFOLD = "/vision_express/common/letter_ver2.webp";
const VISION_TICKET = personaConcept.commonImages.visionTicket;

const JOB_OPTIONS = [
  "영업", "마케팅", "상품기획",
  "연구개발", "설계/엔지니어링", "기획/전략",
  "품질/안전", "생산/제조", "SCM/구매",
  "IT/시스템", "재무/회계", "인사/조직",
  "DX/데이터", "법무", "커뮤니케이션",
];

type LetterLine = { text: string; delay: number; h?: [number, number][] };
// 2026-05-15: split the letter into 3 click-through pages with a larger
// font. Each page reveals its own staggered fade-in; pages 0/1 show a
// "클릭하여 다음으로" hint and advance on click, page 2 shows the
// "승객 명부에 서명하기" button.
const LETTER_PAGES: LetterLine[][] = [
  // Page 1 — 환영 + 초대장 성격
  [
    { text: "변화하는 시대를 가로질러 당신만의 새로운 목적지로 향하는", delay: 0.2 },
    { text: "[비전 익스프레스] 탑승을 환영합니다.", delay: 0.8, h: [[0, 9]] },
    { text: "", delay: 0 },
    { text: "이 열차는 일 년에 단 한 번,", delay: 1.6, h: [[11, 16]] },
    { text: "오직 매거진 STORY가 특별한 초대를 보내는 분들만이 탑승할 수 있습니다.", delay: 2.2, h: [[3, 13]] },
  ],
  // Page 2 — 편집부의 믿음
  [
    { text: "오랫동안 매거진 STORY 편집부는", delay: 0.2 },
    { text: "오직 한 가지 굳건한 믿음으로 유지되었습니다.", delay: 0.8 },
    { text: "", delay: 0 },
    { text: "세상에는 아직 쓰이지 않은 이야기가 있고,", delay: 1.6 },
    { text: "사람들의 내면에 그 이야기가 숨 쉬고 있다는 믿음 말입니다.", delay: 2.2 },
    { text: "우리는 그 깊은 곳의 이야기를 찾아 한 호의 매거진으로 엮어냅니다.", delay: 2.8 },
  ],
  // Page 3 — 프라이빗 객실 + 오늘 밤의 주인공
  // 하이라이트는 현재 단어를 끊는 어색한 위치(예: "오늘 밤, 그 주인공은 바"가
  // "바로"를 자름) 대신, 페이지의 감정적 무게가 실린 완결된 구절 위에 놓는다:
  // - "외부에 열리지 않습니다" (사적 안전감)
  // - "지나온 여정과 앞으로의 시도를 함께 펼쳐보세요" (행동 초대)
  // - "그 주인공은 바로 당신입니다" (주인공 선언)
  [
    { text: "이 열차가 밤의 장막을 품고 달려 아침을 맞이하는 동안,", delay: 0.2 },
    { text: "당신을 위한 프라이빗 객실에서", delay: 0.8 },
    { text: "우리는 함께 단 한 호의 매거진을 만들 것입니다.", delay: 1.4, h: [[7, 17]] },
    { text: "", delay: 0 },
    { text: "이곳의 모든 기록은 외부에 열리지 않습니다.", delay: 2.2, h: [[4, 23]] },
    { text: "안심하고, 지나온 여정과 앞으로의 시도를 함께 펼쳐보세요.", delay: 2.8 },
    { text: "", delay: 0 },
    { text: "오늘 밤, 그 주인공은 바로 당신입니다.", delay: 3.8, h: [[6, 21]] },
  ],
  // Page 4 — 출발 호출 + 승객 명부 서명 버튼 (단독 페이지로 분리해 호흡)
  [
    { text: "그럼 지금 출발해볼까요?", delay: 0.2 },
  ],
];
// Each page is "settled" after its last line's delay + the fade duration.
// Used to gate the "다음으로" hint / signature button so they only appear
// once the participant has actually had time to read the page.
// 마지막 페이지(승객 명부 서명하기 버튼)는 텍스트가 짧아서 settle이 빠른데,
// 그러면 버튼이 페이지 fade-in과 거의 동시에 나타나 어색하므로 추가 buffer를 둠.
const PAGE_SETTLED_MS: number[] = LETTER_PAGES.map((lines, idx) => {
  const lastDelay = Math.max(0, ...lines.map((l) => (l.text ? l.delay : 0)));
  const isLast = idx === LETTER_PAGES.length - 1;
  const buffer = isLast ? 0.9 : 0.55;
  return Math.round((lastDelay + buffer) * 1000);
});

type FreeTextExample = { label: string; quote: string };
const FREETEXT_EXAMPLES: FreeTextExample[] = [
  {
    label: "나만의 고유한 색깔 찾기",
    quote:
      "남들이 말하는 강점 말고, 내가 진짜 몰입하고 즐거워하는 순간이 언제인지 알고 싶어요.",
  },
  {
    label: "커리어의 전환점과 확신",
    quote:
      "지금의 커리어를 넘어, 앞으로 10년 뒤 나라는 브랜드가 어떤 영향력을 가질지 그려보고 싶습니다.",
  },
  {
    label: "타인의 시선과 나의 간극",
    quote:
      "회사에서 기대하는 내 모습과 실제 나 사이의 괴리감 때문에 생긴 고민을 이 기차에 내려놓고 싶어요.",
  },
  {
    label: "다시 시작할 계기",
    quote:
      "요즘 잊고 지냈던 내가 좋아하는 일과 앞으로 더 해보고 싶은 일을 다시 정리해보고 싶어요.",
  },
];

function splitHighlight(text: string, highlights?: [number, number][]) {
  if (!highlights || highlights.length === 0) return [{ text, hl: false }];
  const parts: { text: string; hl: boolean }[] = [];
  let cursor = 0;
  for (const [s, e] of highlights) {
    if (s > cursor) parts.push({ text: text.slice(cursor, s), hl: false });
    parts.push({ text: text.slice(s, e), hl: true });
    cursor = e;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hl: false });
  return parts;
}

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.5 },
};

export function IntroScene({
  spec,
  onAdvance,
  onProgressVisibleChange,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
  onProgressVisibleChange?: (visible: boolean) => void;
}) {
  const { session, patch } = useV3Session();
  const { setScene: setBGM } = useBGM();

  const [phase, setPhase] = useState<Phase>("envelope");
  const [envelopeOpen, setEnvelopeOpen] = useState(false);
  // Letter is now a 3-page click-through. `letterPage` is the current page
  // (0..LETTER_PAGES.length-1); `letterSettled` flips true once the current
  // page's last line has had a beat to fade in (gates the "다음으로" hint /
  // signature button on the final page).
  const [letterPage, setLetterPage] = useState(0);
  const [letterSettled, setLetterSettled] = useState(false);
  // Footer page lags behind letterPage — only updated once the new page has
  // settled. Prevents the next page's footer (e.g. "승객 명부에 서명하기" button)
  // from briefly appearing as a ghost over the outgoing page during the
  // opacity fade-out animation.
  const [footerPage, setFooterPage] = useState(0);
  const [name, setName] = useState(session.name);
  const [gender, setGender] = useState<"그" | "그녀">(session.gender);
  const [job, setJob] = useState(session.job);
  const [customJob, setCustomJob] = useState("");
  const [freeText, setFreeText] = useState(session.freeContext);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [coverReady, setCoverReady] = useState(false);

  // Cover settle delay
  useEffect(() => {
    if (phase !== "cover") return;
    const t = setTimeout(() => setCoverReady(true), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  // Phase audio:
  //   envelope → letter (page 0) : paper-handle + pen-writing one-shot (큰 볼륨)
  //   letter page 1+             : pen/paper 즉시 정지 (편지 첫 등장 분위기 한정)
  //   cover                      : station-platform loop (외부 플랫폼 진입 시점)
  //   register/freetext는 아직 객실 안이라 외부 소음 제외
  useEffect(() => {
    // paper(종이 들기 소리)는 편지 첫 페이지 진입 시 한 번만 — 이후엔 정지.
    if (phase === "letter" && letterPage === 0) {
      audio.playOnce("paper", 0.9);
    } else {
      audio.stop("paper");
    }
    // pen(손글씨 소리)은 편지 phase 전체에서 loop — 모든 4 페이지 동안 유지.
    // 원본 mp3 자체가 매우 잔잔해서 max(1.0)로 깔아야 손글씨 결이 들린다.
    if (phase === "letter") {
      audio.startLoop("pen", 1.0);
    } else {
      audio.stopLoop("pen");
    }
    const onPlatform = phase === "cover";
    if (onPlatform) {
      audio.startLoop("station");
      // 경적은 다음 씬(0-1 departing-train)의 BGM에서 울리므로 티켓 페이지에서는
      // 중복으로 울리지 않도록 제거. 여기서는 플랫폼 station ambience만.
    } else {
      audio.stopLoop("station");
      audio.stop("horn");
    }
  }, [phase, letterPage]);

  // Always stop the station loop when IntroScene unmounts (e.g. participant
  // advances from cover into chapter 1) — the per-phase effect above only
  // handles transitions while still mounted.
  useEffect(() => {
    return () => {
      audio.stopLoop("station");
      audio.stopLoop("pen");
      audio.stop("paper");
    };
  }, []);

  // Per-phase BGM control — intro chapter 0 has no default BGM (silent during
  // envelope suspense), but we want quiet train ambience underneath the letter
  // so it doesn't feel completely dead between pen-writing SFX moments.
  useEffect(() => {
    if (phase === "letter") {
      setBGM("kokoreli777-inside-old-train-169418.mp3", 0);
    } else if (phase === "register" || phase === "freetext") {
      setBGM("kokoreli777-inside-old-train-169418.mp3", 0);
    } else {
      setBGM(undefined, 0);
    }
  }, [phase, setBGM]);

  // Reset letter pagination whenever the participant (re-)enters the letter
  // phase from the envelope. setState deferred via queueMicrotask to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (phase !== "letter") return;
    queueMicrotask(() => {
      setLetterPage(0);
      setLetterSettled(false);
      setFooterPage(0);
    });
  }, [phase]);

  // Sync footerPage → letterPage once the new page is fully settled, so the
  // footer swaps to the new page's content only after the fade-out completes.
  useEffect(() => {
    if (letterSettled && footerPage !== letterPage) {
      setFooterPage(letterPage);
    }
  }, [letterSettled, letterPage, footerPage]);

  // Per-page settle timer — flips letterSettled once the current page's last
  // line has had a beat to fade in. Cleared on page change / phase change.
  useEffect(() => {
    if (phase !== "letter") return;
    const dwell = PAGE_SETTLED_MS[letterPage] ?? 0;
    queueMicrotask(() => setLetterSettled(false));
    const t = setTimeout(() => setLetterSettled(true), dwell);
    return () => clearTimeout(t);
  }, [phase, letterPage]);

  useEffect(() => {
    onProgressVisibleChange?.(phase !== "envelope" && phase !== "letter");
  }, [onProgressVisibleChange, phase]);

  // Esc closes the examples modal.
  useEffect(() => {
    if (!examplesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExamplesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [examplesOpen]);

  const handleEnvelope = () => {
    if (envelopeOpen) return;
    setEnvelopeOpen(true);
    setTimeout(() => setPhase("letter"), 1400);
  };

  const handleRegisterSubmit = () => {
    const trimmedName = name.trim();
    const finalJob = job === "기타" ? customJob.trim() : job;
    if (!trimmedName || !finalJob) return;
    patch({ name: trimmedName, gender, job: finalJob });
    setPhase("freetext");
  };

  const handleFreeSubmit = () => {
    const txt = freeText.trim();
    if (txt) patch({ freeContext: txt });
    setPhase("cover");
  };

  const handleBoard = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const finalJob = job === "기타" ? customJob.trim() : job;
  const registerReady = name.trim().length > 0 && finalJob.length > 0;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* 모든 phase에서 우측 상단에 항상 표시되는 음량 컨트롤 */}
      <div className="absolute top-0 right-0 z-30 px-8 py-5">
        <VolumeControl />
      </div>
      <AnimatePresence mode="wait">
        {/* ─── envelope ─── */}
        {phase === "envelope" && (
          <motion.div
            key="envelope"
            className="absolute inset-0 cursor-pointer"
            onClick={handleEnvelope}
            {...fadeIn}
          >
            <Image src={INTRO_BG} alt="" fill className="object-cover" priority />
            <div className="absolute inset-0" style={{ background: "rgba(20,12,6,0.45)" }} />

            <div className="relative z-10 flex h-full flex-col items-center justify-center px-6">
              <Header />
              <motion.div
                className="mt-12 relative"
                style={{ width: "min(420px, 85vw)", filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.4))" }}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
              >
                <motion.div animate={envelopeOpen ? { scale: 1.05, y: -16 } : {}} transition={{ duration: 0.6 }}>
                  <Image src={INVITE_LETTER} alt="초대장" width={420} height={290} className="h-auto w-full" priority />
                </motion.div>
                {!envelopeOpen && (
                  <motion.div
                    className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: 72, height: 72, background: "radial-gradient(circle, rgba(212,165,74,0.25) 0%, transparent 70%)" }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.div>
              <motion.p
                className="mt-[28px] text-center text-[20px] leading-[1.55] tracking-wider"
                style={{ fontFamily: "var(--font-ridi-batang)", color: "#f5ead6" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4, duration: 1 }}
              >
                당신을 위한 특별한 초대장이 도착했습니다.
              </motion.p>
              {!envelopeOpen && (
                <motion.p
                  className="mt-6 font-mono text-[12px] tracking-[0.2em]"
                  style={{ color: "#ffffff" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ delay: 2.2, duration: 2, repeat: Infinity }}
                >
                  click to open
                </motion.p>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── letter (3-page click-through) ─── */}
        {phase === "letter" && (
          <motion.div key="letter" className="absolute inset-0" {...fadeIn}>
            <Image src={INTRO_BG} alt="" fill className="object-cover" />
            <div className="absolute inset-0" style={{ background: "rgba(20,12,6,0.55)" }} />

            {/* Header is pinned to the top so the letter card can sit in the visual center. */}
            <div className="absolute inset-x-0 top-6 z-10 flex justify-center md:top-8">
              <Header small />
            </div>

            <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 py-6">
              <motion.div
                className={
                  // Card is click-to-advance on pages 0/1; on the last page
                  // only the signature button advances (cursor stays default
                  // so the page reads as "complete + waiting for the
                  // ritual button").
                  letterPage < LETTER_PAGES.length - 1
                    ? "relative cursor-pointer"
                    : "relative"
                }
                style={{
                  // Fixed letter paper dimensions — visual layout stays
                  // identical across viewports / browser zoom, no jitter
                  // as the page size changes.
                  width: 630,
                  height: 420,
                  filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.3))",
                  marginTop: "calc(-6vh + 40px)",
                }}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                onClick={() => {
                  if (letterPage >= LETTER_PAGES.length - 1) return;
                  if (!letterSettled) return;
                  setLetterPage((p) => Math.min(p + 1, LETTER_PAGES.length - 1));
                }}
              >
                <Image
                  src={LETTER_UNFOLD}
                  alt="편지지"
                  width={630}
                  height={420}
                  className="block h-full w-full"
                />
                {/* Letter content overlay — fixed-pixel padding for the
                    locked 630×420 letterhead. Bottom padding leaves room
                    for the absolute-positioned footer (이전/다음 anchored
                    to bottom: 32px). */}
                <div
                  className="absolute inset-x-0 top-0 overflow-y-auto"
                  style={{ paddingTop: 56, paddingRight: 60, paddingLeft: 76, bottom: 76 }}
                >
                  {/* Re-key the lines container on letterPage so each new
                      page starts its fade-in from scratch. */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={letterPage}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      {LETTER_PAGES[letterPage].map((line, i) => {
                        if (!line.text) return <div key={i} style={{ height: 8 }} />;
                        return (
                          <motion.p
                            key={i}
                            style={{
                              // 나눔손글씨(성실체) — letterhead reads as a
                              // hand-written editor's note instead of a
                              // formal serif typeset.
                              fontFamily: "var(--font-nanum-seongsirce), var(--font-ridi-batang), serif",
                              fontSize: 24,
                              lineHeight: 1.45,
                              color: "#3d2414",
                              wordBreak: "keep-all",
                              overflowWrap: "break-word",
                              marginBottom: "0.15em",
                            }}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: line.delay, duration: 0.55, ease: "easeOut" }}
                          >
                            {splitHighlight(line.text, line.h).map((part, j) =>
                              part.hl ? (
                                <span
                                  key={j}
                                  style={{
                                    background:
                                      "linear-gradient(transparent 55%, rgba(212,180,130,0.35) 55%, rgba(212,180,130,0.35) 90%, transparent 90%)",
                                    padding: "0 2px",
                                  }}
                                >
                                  {part.text}
                                </span>
                              ) : (
                                <span key={j}>{part.text}</span>
                              ),
                            )}
                          </motion.p>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Letter footer — anchored to bottom of the letter paper
                    (bottom: 44px) so 이전/다음 don't get pushed off when
                    the page text is long. Sits OUTSIDE the AnimatePresence
                    so it doesn't fade with each page change — only its
                    opacity reacts to letterSettled per page. */}
                <motion.div
                  className="absolute flex items-end justify-center"
                  style={{ bottom: 52, left: 76, right: 60 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: letterSettled ? 1 : 0 }}
                  transition={{ duration: 0.5 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Footer content only renders once the current page has
                      fully settled — this prevents the previous page's
                      buttons (especially "승객 명부에 서명하기" on last page)
                      from ghosting onto the next page during the opacity
                      fade-out when navigating with "이전". The parent's
                      opacity animation still handles the fade-in. */}
                  {letterSettled && footerPage > 0 && (
                    <div className="absolute left-0 mb-0">
                      <NavText
                        label="이전"
                        onClick={() => {
                          setLetterSettled(false);
                          setLetterPage((p) => Math.max(0, p - 1));
                        }}
                      />
                    </div>
                  )}
                  {letterSettled && (
                    footerPage < LETTER_PAGES.length - 1 ? (
                      // Non-last pages — 다음 anchored right.
                      <div className="absolute right-0 mb-0">
                        <NavText
                          label="다음"
                          onClick={() => {
                            if (!letterSettled) return;
                            // 페이지 변경 즉시 letterSettled를 false로 만들어
                            // 다음 페이지의 footer(승객 명부 서명하기 버튼 등)가
                            // 미리 보이는 깜빡임을 방지한다.
                            setLetterSettled(false);
                            setLetterPage((p) =>
                              Math.min(LETTER_PAGES.length - 1, p + 1),
                            );
                          }}
                        />
                      </div>
                    ) : (
                      // Last page — 승객 명부 button centered (이전 still
                      // floats absolute-left).
                      <div className="mb-0">
                        <StoryButtonV3
                          label="승객 명부에 서명하기"
                          onClick={() => setPhase("register")}
                          ritual
                          size="lg"
                        />
                      </div>
                    )
                  )}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ─── register ─── */}
        {phase === "register" && (
          <motion.div key="register" className="absolute inset-0 overflow-y-auto" {...fadeIn}>
            <Image src={BG_STATION} alt="" fill className="object-cover" />
            <div className="absolute inset-0" style={{ background: "rgba(20,12,6,0.18)" }} />

            <div className="absolute inset-x-0 top-6 z-10 flex justify-center md:top-8">
              <Header small />
            </div>

            <div className="relative z-10 flex min-h-full flex-col items-center px-4 pb-8 pt-24">
              <motion.div
                className="relative w-full"
                style={{ maxWidth: 480, marginTop: 40, filter: "drop-shadow(0 10px 32px rgba(0,0,0,0.22))" }}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.7 }}
              >
                <div
                  className="flex max-h-[calc(100vh_-_140px)] flex-col overflow-hidden rounded-md border border-[#d7bd83]/25 bg-[#f6efdf]/95 px-7 py-7"
                  style={{ fontFamily: "var(--font-ridi-batang)" }}
                >
                  <h2 className="mb-6 text-center text-[20px] font-semibold tracking-[0.02em] text-[#3d2414]">승객 명부</h2>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-20">
                    <div>
                      <label className="text-[14px] font-semibold leading-[1.7] text-[#5a4a38]">탑승객의 성함을 알려주세요.</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && registerReady) handleRegisterSubmit();
                        }}
                        placeholder="이름을 입력하세요"
                        className="mt-3 h-9 w-full rounded-sm border border-[#8c785a]/25 bg-[#fbf6ea]/55 px-3 text-[14px] text-[#3d2414] outline-none transition placeholder:text-[#a18965] focus:border-[#d4a54a]"
                        autoFocus
                      />
                    </div>

                    <div className="mt-[20px]">
                      <label className="text-[14px] font-semibold leading-[1.7] text-[#5a4a38]">탑승객의 성별을 알려주세요.</label>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setGender("그")}
                          className={`h-9 rounded-sm border px-2 text-[14px] transition ${
                            gender === "그"
                              ? "border-[#d4a54a] bg-[#efe2c4] text-[#3d2414]"
                              : "border-[#8c785a]/25 bg-[#f2ebdd]/35 text-[#8a6f5f]"
                          }`}
                        >
                          남성
                        </button>
                        <button
                          type="button"
                          onClick={() => setGender("그녀")}
                          className={`h-9 rounded-sm border px-2 text-[14px] transition ${
                            gender === "그녀"
                              ? "border-[#d4a54a] bg-[#efe2c4] text-[#3d2414]"
                              : "border-[#8c785a]/25 bg-[#f2ebdd]/35 text-[#8a6f5f]"
                          }`}
                        >
                          여성
                        </button>
                      </div>
                    </div>

                    <div className="mt-[20px]">
                      <label className="text-[14px] font-semibold leading-[1.7] text-[#5a4a38]">탑승객의 직무를 알려주세요.</label>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[...JOB_OPTIONS, "기타"].map((j) => (
                          <button
                            key={j}
                            type="button"
                            onClick={() => setJob(j)}
                            className={`h-9 rounded-sm border px-2 text-[14px] transition ${
                              job === j
                                ? "border-[#d4a54a] bg-[#efe2c4] text-[#3d2414]"
                                : "border-[#8c785a]/25 bg-[#f2ebdd]/35 text-[#8a6f5f]"
                            }`}
                          >
                            {j}
                          </button>
                        ))}
                      </div>
                      {job === "기타" && (
                        <input
                          type="text"
                          value={customJob}
                          onChange={(e) => setCustomJob(e.target.value)}
                          placeholder="직무를 입력해주세요"
                          className="mt-3 h-9 w-full rounded-sm border border-[#8c785a]/25 bg-[#fbf6ea]/55 px-3 text-[14px] text-[#3d2414] outline-none transition placeholder:text-[#a18965] focus:border-[#d4a54a]"
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer — anchored to bottom of form card matching letter phase
                    positioning (bottom: 44) */}
                <div
                  className="absolute flex items-end justify-center"
                  style={{ bottom: 44, left: 36, right: 36 }}
                >
                  <StoryButtonV3 label="다음" onClick={handleRegisterSubmit} disabled={!registerReady} ritual />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ─── freetext ─── */}
        {phase === "freetext" && (
          <motion.div key="freetext" className="absolute inset-0 overflow-y-auto" {...fadeIn}>
            <Image src={BG_STATION} alt="" fill className="object-cover" />
            <div className="absolute inset-0" style={{ background: "rgba(20,12,6,0.30)" }} />

            <div className="absolute inset-x-0 top-6 z-10 flex justify-center md:top-8">
              <Header small />
            </div>

            <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-4 pb-10 pt-36">
              <motion.div
                className="w-full"
                style={{ maxWidth: 568, filter: "drop-shadow(0 10px 32px rgba(0,0,0,0.28))" }}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.7 }}
              >
                <div
                  className="flex max-h-[calc(100vh_-_190px)] flex-col overflow-hidden rounded-md border border-[#d7bd83]/35 bg-[#f6efdf]/95 px-7 py-8 md:px-10 md:py-10"
                  style={{ fontFamily: "var(--font-ridi-batang)" }}
                >
                  <h2 className="mb-7 text-center text-[22px] font-semibold tracking-[0.02em] text-[#3d2414] md:text-[25px]">
                    승객 명부
                  </h2>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <p className="text-[14px] font-semibold leading-[1.7] text-[#5a4a38]">
                      이 열차에 오르기 전, 마음에 남아 있는 것이 있을까요?
                    </p>
                    <textarea
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      aria-label="열차에 오르기 전 남기고 싶은 기록"
                      placeholder={"이 여정에 남기는 기록은 바깥에 공개되지 않아요.\n지금 안고 있는 작은 고민, 기대, 망설임 중\n함께 싣고 갈 것을 편하게 남겨주세요."}
                      className="mt-3 min-h-[230px] w-full resize-none rounded-sm border border-[#8c785a]/25 bg-[#fbf6ea]/55 px-4 py-3 text-[14px] leading-[1.7] text-[#3d2414] outline-none transition placeholder:text-[#8a7a68]/70 focus:border-[#b99b6b] focus:bg-[#fffaf0]/75 md:text-[15px]"
                    />
                    <div className="mt-[8px]">
                      <button
                        type="button"
                        onClick={() => setExamplesOpen(true)}
                        className="text-[12px] text-[#8a7a68] underline decoration-[#8a7a68]/40 underline-offset-[3px] transition hover:text-[#3d2414] hover:decoration-[#3d2414] md:text-[13px]"
                      >
                        다른 승객들은 주로 어떤 생각을 가졌을까요?
                      </button>
                    </div>
                    <div className="mt-7 flex items-center justify-center">
                      <StoryButtonV3
                        label="입력하기"
                        onClick={handleFreeSubmit}
                        ritual
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Examples modal — kept out of the inline form so the small paper
                card stays uncluttered ("정신없으니" feedback). Backdrop click
                or Esc closes; examples are read-only references. */}
            <AnimatePresence>
              {examplesOpen && (
                <motion.div
                  key="examples-modal"
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
                    aria-label="다른 승객들의 예시"
                    className="relative z-10 w-full max-w-[480px] rounded-md border border-[#d7bd83]/40 bg-[#f6efdf] p-5 shadow-2xl md:p-6"
                    style={{ fontFamily: "var(--font-ridi-batang)" }}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 8, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[12px] uppercase tracking-[0.32em] text-[#7a5a3a]">
                          From other passengers
                        </p>
                        <h2 className="mt-1 text-[14px] font-semibold text-[#3d2414] md:text-[15px]">
                          다른 승객들은 주로 어떤 생각을 가졌을까요?
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
                    <div className="mt-4 space-y-2.5">
                      {FREETEXT_EXAMPLES.map((ex, i) => (
                        <div
                          key={i}
                          className="block w-full rounded-md border border-[#8c785a]/25 bg-white/40 p-3 text-left"
                        >
                          <p className="text-[14px] font-medium text-[#5a4a38] md:text-[15px]">
                            {i + 1}. {ex.label}
                          </p>
                          <p className="mt-1 text-[12px] leading-[1.55] text-[#8a7a68] md:text-[13px]">
                            &ldquo;{ex.quote}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-center text-[12px] italic text-[#8a7a68]">
                      참고용 예시입니다. 내 기록은 직접 입력해주세요.
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ─── cover (티켓 발권) ─── */}
        {phase === "cover" && (
          <motion.div key="cover" className="absolute inset-0" {...fadeIn}>
            <Image src={BG_TRAIN} alt="" fill className="object-cover" />
            <div className="absolute inset-0" style={{ background: "rgba(10,6,3,0.45)" }} />

            <div className="absolute inset-x-0 top-6 z-10 flex justify-center md:top-8">
              <Header small />
            </div>

            <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 pb-8">
              {/* Ticket — v1 image + overlay on the right card area */}
              <motion.div
                className="relative"
                style={{ width: "min(672px, 95vw)", filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.4))" }}
                initial={{ y: 40, opacity: 0, rotateX: 15 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              >
                <Image src={VISION_TICKET} alt="" width={672} height={896} className="h-auto w-full" />

                {/* Vision ticket overlays — new ticket image already has all labels
                    (Destination, Type 편도, Journey, Passenger, Date, Booking) baked in.
                    We only overlay user values at the empty spots shown in
                    vision_ticket_new_sample.png. */}
                {(() => {
                  // Match the "편도" baked into the ticket image: wine/dark-red tone + similar size.
                  const valueStyle = {
                    color: "#582930",
                    fontFamily: "var(--font-ridi-batang)",
                    fontSize: "clamp(12px, 1.7vw, 14px)",
                    whiteSpace: "nowrap" as const,
                    margin: 0,
                    lineHeight: 1,
                    transform: "translateY(-50%)",
                  };
                  const today = new Date();
                  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
                  const bookingNo = `NO. ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
                  return (
                    <>
                      {/* Journey value — next to "Journey :" label (right column of main ticket) */}
                      <p className="absolute" style={{ ...valueStyle, top: "57%", left: "62%" }}>
                        {session.job || finalJob || "—"}
                      </p>
                      {/* Passenger value — next to "Passenger :" label */}
                      <p className="absolute" style={{ ...valueStyle, top: "70%", left: "45%" }}>
                        {session.name || name || "—"}
                      </p>
                      {/* Date value — next to "Date :" label */}
                      <p className="absolute" style={{ ...valueStyle, top: "78%", left: "40%" }}>
                        {dateStr}
                      </p>
                      {/* Booking Ref — right stub, rotated 90° to match the printed label */}
                      <p
                        className="absolute"
                        style={{
                          ...valueStyle,
                          top: "50%",
                          right: "9%",
                          transform: "translateY(-50%) rotate(90deg)",
                          transformOrigin: "center",
                        }}
                      >
                        {bookingNo}
                      </p>
                    </>
                  );
                })()}
              </motion.div>

              <motion.p
                className="mt-6 text-center text-[20px] leading-[1.55] tracking-wider"
                style={{ fontFamily: "var(--font-ridi-batang)", color: "#f5ead6" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: coverReady ? 1 : 0 }}
                transition={{ duration: 0.8 }}
              >
                {(session.name || name) && (
                  <>
                    {session.name || name}승객님, 발권이 완료되었어요.
                    <br />
                    열차가 곧 출발합니다.
                  </>
                )}
              </motion.p>

              <motion.div
                className="mt-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: coverReady ? 1 : 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                <StoryButtonV3 label="탑승하기" onClick={handleBoard} ritual variant="secondary" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header({ small }: { small?: boolean }) {
  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.8 }}
    >
      <h1
        style={{
          fontFamily: "var(--font-title)",
          fontStyle: "normal",
          fontWeight: 700,
          fontSize: small ? "clamp(1.1rem, 2.6vw, 1.6rem)" : "clamp(1.6rem, 4vw, 2.4rem)",
          lineHeight: 1.5,
          color: "rgba(220, 195, 145, 0.92)",
          letterSpacing: "0.02em",
        }}
      >
        Magazine STORY
      </h1>
      <p
        className="mt-1 uppercase"
        style={{
          fontFamily: "var(--font-title)",
          fontWeight: 400,
          fontSize: small ? "clamp(12px, 1vw, 13px)" : "clamp(12px, 1.1vw, 14px)",
          letterSpacing: "0.5em",
          color: "rgba(200, 175, 130, 0.55)",
        }}
      >
        Vision Express
      </p>
    </motion.div>
  );
}
