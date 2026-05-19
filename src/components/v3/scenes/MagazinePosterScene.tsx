"use client";

import type { CSSProperties, ReactNode } from "react";
import { useContext, useEffect } from "react";
import { motion } from "framer-motion";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { DialogStageContext } from "@/components/v3/V3App";
import { josa } from "@/lib/v3/scenes/josa";
import { extractIdentityTitle, toAnchorSummary } from "@/lib/v3/scenes/template";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

/**
 * HTML magazine-spread poster shown between the PDF handoff (C-2) and the
 * closing thanks (C-3). Aims at the look of a printed editorial spread —
 * cover hero, article headline, then a 2x3 grid of editorial cards
 * summarizing the participant's value / vision / first step / allies /
 * resources, with an "editor's note" capstone. No AI-generated imagery —
 * pure typography + gold rules + cream paper.
 */
export function MagazinePosterScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  const valueDef = session.valueDefinitions[session.topValue] ?? "";
  const identityTitle = extractIdentityTitle(session.identityName);
  const visionSummary = toAnchorSummary(session.visionLine, 84);
  const firstStepSummary = toAnchorSummary(session.firstStep, 56);
  const supportSummary = toAnchorSummary(session.supportPerson, 44);
  const resourceSummary = toAnchorSummary(session.neededResource, 52);

  return (
    <div
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden"
      onClick={advance}
    >
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative mx-auto flex h-[clamp(560px,calc(100vh_-_230px),760px)] w-full max-w-[620px] flex-col overflow-hidden bg-[#f7efde] px-6 py-6 text-[#3d2414] shadow-[0_18px_60px_-18px_rgba(61,36,20,0.55)] md:px-7 md:py-7"
      >
        <div className="absolute inset-3 rounded-sm border border-[#b99b6b]/40" aria-hidden />

        {/* — Cover header — */}
        <header className="relative flex flex-col items-center text-center">
          <p className="text-[16px] uppercase tracking-[0.42em] text-[#7a5a3a]">
            Vision Express
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-px w-8 bg-[#b99b6b]/55" />
            <h1
              className="text-[30px] font-bold tracking-[0.015em] text-[#3d2414] md:text-[34px]"
              style={{ fontFamily: "var(--font-title)" }}
            >
              Magazine STORY
            </h1>
            <div className="h-px w-8 bg-[#b99b6b]/55" />
          </div>
          <div className="mt-2 flex items-center gap-4 text-[16px] tracking-[0.28em] text-[#7a5a3a]">
            <span>VOL. {session.name.toUpperCase()}</span>
            <span className="opacity-50">·</span>
            <span>{dateStr}</span>
          </div>
        </header>

        {/* — Article hero — */}
        <section className="relative mt-5 flex flex-col items-center border-y border-[#b99b6b]/35 px-2 py-4 text-center">
          <p className="text-[16px] uppercase tracking-[0.4em] text-[#7a5a3a]">
            The Story of
          </p>
          {identityTitle && (
            <h2
              className="mt-2 overflow-hidden text-[22px] font-medium leading-tight text-[#3d2414] md:text-[25px]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              {trimQuotes(identityTitle)}
            </h2>
          )}
          {session.topValue && (
            <p className="mt-2 text-[16px] tracking-[0.16em] text-[#7a5a3a]">
              {session.topValue}{josa(session.topValue, "을/를")} 가장 소중히 여기는 {session.gender || "그"}
            </p>
          )}
        </section>

        {/* — Info grid — */}
        <section className="relative mt-5 grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden">
          {session.topValue && (
            <PosterCard label="The Most Precious Value" tone="gold">
              <p
                className="text-[16px] font-medium leading-tight"
                style={{ fontFamily: "var(--font-ridi-batang), serif" }}
              >
                &ldquo;{session.topValue}&rdquo;
              </p>
              {valueDef && (
                <ClampText
                  lines={4}
                  className="mt-2 text-[16px] italic leading-relaxed text-[#5a3d22]"
                >
                  {trimQuotes(valueDef)}
                </ClampText>
              )}
            </PosterCard>
          )}

          {session.visionLine && (
            <PosterCard label="The 4-Year Vision">
              <ClampText
                lines={4}
                className="text-[16px] leading-relaxed text-[#3d2414]"
                style={{ fontFamily: "var(--font-ridi-batang), serif" }}
              >
                {trimQuotes(visionSummary)}
              </ClampText>
            </PosterCard>
          )}

          {session.firstStep && (
            <PosterCard label="My Next Step" tone="gold">
              <ClampText lines={4} className="text-[16px] leading-relaxed">
                {trimQuotes(firstStepSummary)}
              </ClampText>
            </PosterCard>
          )}

          {session.supportPerson && (
            <PosterCard label="My Allies">
              <ClampText lines={4} className="text-[16px] leading-relaxed">
                {trimQuotes(supportSummary)}
              </ClampText>
            </PosterCard>
          )}

          {session.neededResource && (
            <div className="col-span-2">
              <PosterCard label="Required Resources">
                <ClampText lines={3} className="text-[16px] leading-relaxed">
                  {trimQuotes(resourceSummary)}
                </ClampText>
              </PosterCard>
            </div>
          )}
        </section>

        {/* — Editor's note — */}
        <section className="relative mt-4 shrink-0 border-t border-[#b99b6b]/35 pt-3 text-center">
          <p className="text-[16px] uppercase tracking-[0.4em] text-[#7a5a3a]">
            Editor&rsquo;s Note
          </p>
          <p
            className="mt-2 text-[16px] italic leading-relaxed text-[#5a3d22]"
            style={{ fontFamily: "var(--font-ridi-batang), serif" }}
          >
            본 호는 {session.name}님 한 분만을 위해 발행된 단 한 호의 매거진입니다.
            <br />
            여기 적힌 결이 — 앞으로 {session.name}님의 길에 자주 다시 펼쳐지길.
          </p>
        </section>

        {/* — Footer — */}
        <footer className="relative mt-3 flex shrink-0 items-center justify-center gap-3 text-[16px] tracking-[0.25em] text-[#7a5a3a]">
          <div className="h-px w-6 bg-[#b99b6b]/45" />
          <span>오직 한 사람을 위한 단 한 호의 매거진</span>
          <div className="h-px w-6 bg-[#b99b6b]/45" />
        </footer>
      </motion.article>

      <div className="mt-3 flex items-center justify-end text-[16px] text-[#8b7050]">
        <span className="italic">다음</span>
      </div>
    </div>
  );
}

function PosterCard({
  label,
  tone = "plain",
  children,
}: {
  label: string;
  tone?: "plain" | "gold";
  children: ReactNode;
}) {
  const accent =
    tone === "gold"
      ? "border-[#b99b6b]/55 bg-[#fbf5e6]"
      : "border-[#b99b6b]/35 bg-white/35";
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-sm border ${accent} px-3 py-3`}>
      <p className="text-[7.5px] uppercase tracking-[0.28em] text-[#7a5a3a]">
        {label}
      </p>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden text-[#3d2414]">{children}</div>
    </div>
  );
}

function ClampText({
  children,
  lines,
  className,
  style,
}: {
  children: ReactNode;
  lines: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      className={className}
      style={{
        ...style,
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
      }}
    >
      {children}
    </p>
  );
}

function trimQuotes(s: string): string {
  return s.trim().replace(/^["'`「」“”‘’]+/, "").replace(/["'`「」“”‘’]+$/, "");
}
