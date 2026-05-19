"use client";

import type { CSSProperties, ReactNode } from "react";
import { useContext, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagazineArticlePage,
  MagazineArticleLoading,
} from "@/components/v3/ui/MagazineArticlePage";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import { josa } from "@/lib/v3/scenes/josa";
import { extractIdentityTitle, toAnchorSummary } from "@/lib/v3/scenes/template";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

/**
 * ── [v2 — 2026-05-19] 합본 매거진 스프레드 ────────────────────────────
 *
 * PDF handoff(C-2) 직후 보여주는 "한 호의 매거진" 전체 읽기 화면.
 *
 * 호흡:
 *   Spread 1 — Chapter 1 (왼쪽) + Chapter 2 (오른쪽)
 *     → "다음 페이지"
 *   Spread 2 — Chapter 3 (왼쪽) + Chapter 4 (오른쪽)
 *     → "다음 페이지"
 *   Spread 3 — Editor's Cards (한 호의 요약 카드 — 가치/비전/한 걸음/...)
 *     → "이 호를 닫을게요" (advance to C-3)
 *
 * 각 챕터 페이지는 `MagazineArticlePage` (RecordPageScene과 동일한 룩 —
 * 드롭캡 본문 + 헤드라인 + pullQuote)을 재사용.
 *
 * 데이터:
 *   - chapterArticles[1..4]가 세션에 캐싱되어 있으면 그대로 사용
 *   - 빠진 챕터만 llm.writeChapterArticle 로 채움
 *
 * 모바일: 좌·우 spread 대신 단일 컬럼 세로 스택으로 fallback.
 *
 * 이전 디자인(2x3 카드 그리드)은 MagazinePosterScene_v1.tsx 에 보존.
 */
type Chapter = 1 | 2 | 3 | 4;
type Article = { headline: string; body: string; pullQuote: string | null };
type Articles = Partial<Record<Chapter, Article>>;

const SPREADS: { left: Chapter; right: Chapter }[] = [
  { left: 1, right: 2 },
  { left: 3, right: 4 },
];

export function MagazinePosterScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session, patch } = useV3Session();
  const { setStage } = useContext(DialogStageContext);

  const [articles, setArticles] = useState<Articles>(() => session.chapterArticles ?? {});
  // 0, 1 = chapter spreads / 2 = cards spread (한 호의 요약)
  const [page, setPage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  // Fetch only missing chapters. Already-cached chapters render immediately.
  useEffect(() => {
    let cancelled = false;
    const missing: Chapter[] = ([1, 2, 3, 4] as Chapter[]).filter((c) => !articles[c]);
    if (missing.length === 0) return;
    (async () => {
      const results = await Promise.all(
        missing.map(async (c) => {
          try {
            const r = await llm.writeChapterArticle({
              name: session.name,
              gender: session.gender,
              job: session.job,
              chapter: c,
              session,
            });
            return [c, r] as const;
          } catch (err) {
            console.error(`[v3] writeChapterArticle ch${c} failed:`, err);
            return [c, null] as const;
          }
        }),
      );
      if (cancelled) return;
      // 세션 캐시 타입은 Record<number, Article>(non-undefined). 빈 값은
      // 빼고 모은다.
      const patchArticles: Record<number, Article> = {};
      for (const [c, r] of results) {
        if (r) patchArticles[c] = r;
      }
      setArticles({ ...articles, ...patchArticles });
      patch({ chapterArticles: { ...session.chapterArticles, ...patchArticles } });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advanceScene = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  const handleNext = () => {
    if (page < 2) {
      setPage(((page + 1) as 0 | 1 | 2));
      // Scroll to top of the spread when navigating — avoids the next spread
      // opening already mid-scroll from the previous one.
      const root = document.getElementById("magazine-spread-root");
      if (root) root.scrollTop = 0;
    } else {
      advanceScene();
    }
  };

  const handlePrev = () => {
    if (page > 0) {
      setPage(((page - 1) as 0 | 1 | 2));
      const root = document.getElementById("magazine-spread-root");
      if (root) root.scrollTop = 0;
    }
  };

  const buttonLabel =
    page < 2 ? "다음 페이지" : spec.buttonLabel ?? "이 호를 닫을게요";
  const pageIndicator = `${page + 1} / 3`;

  return (
    <div id="magazine-spread-root" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* ── 매거진 마스트헤드 (모든 spread 공통) ─────────────────────── */}
      <header className="mb-4 shrink-0 text-center">
        <p className="text-[11px] tracking-[0.42em] text-[#7a5a3a]">
          MAGAZINE STORY · VOL. {session.name.toUpperCase() || "?"}
        </p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[12px] tracking-[0.3em] text-[#9a7b4c]">{pageIndicator}</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* ── 스프레드 본문 ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="flex-1"
        >
          {page < 2 ? (
            <ChapterSpread
              left={SPREADS[page].left}
              right={SPREADS[page].right}
              articles={articles}
            />
          ) : (
            <CardsSpread session={session} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── 푸터 (이전/다음) ────────────────────────────────────────── */}
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
          key={`adv-${page}`}
          label={buttonLabel}
          onClick={handleNext}
          ritual
        />
      </footer>
    </div>
  );
}

/** 좌·우 2면 — 한 spread 안에 챕터 article 2개. 모바일은 세로 스택. */
function ChapterSpread({
  left,
  right,
  articles,
}: {
  left: Chapter;
  right: Chapter;
  articles: Articles;
}) {
  const leftArt = articles[left];
  const rightArt = articles[right];
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-0">
      <PagePanel side="left">
        {leftArt ? (
          <MagazineArticlePage chapter={left} article={leftArt} />
        ) : (
          <MagazineArticleLoading chapter={left} />
        )}
      </PagePanel>
      <PagePanel side="right">
        {rightArt ? (
          <MagazineArticlePage chapter={right} article={rightArt} />
        ) : (
          <MagazineArticleLoading chapter={right} />
        )}
      </PagePanel>
    </div>
  );
}

/** 한 페이지 패널 — 데스크탑에선 좌/우 분리선(중앙 fold), 모바일은 위/아래 구분선. */
function PagePanel({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  const fold =
    side === "left"
      ? "md:border-r md:border-[#b99b6b]/30 md:pr-7"
      : "md:pl-7";
  return <div className={`px-1 py-1 ${fold}`}>{children}</div>;
}

/** ── 마지막 spread — 한 호의 요약 카드 ──────────────────────────────
 * v1 디자인의 핵심 정보(가치/비전/한 걸음/곁의 사람/자원)를 한 페이지 매거진
 * 스프레드 형태로 재구성. 진짜 잡지의 "마지막 page — Editor's Cards" 느낌. */
function CardsSpread({ session }: { session: V3Session }) {
  const valueDef = session.valueDefinitions[session.topValue] ?? "";
  const identityTitle = extractIdentityTitle(session.identityName);
  const visionSummary = toAnchorSummary(session.visionLine, 84);
  const firstStepSummary = toAnchorSummary(session.firstStep, 56);
  const supportSummary = toAnchorSummary(session.supportPerson, 44);
  const resourceSummary = toAnchorSummary(session.neededResource, 52);

  return (
    <article className="space-y-5">
      {/* 표제 — Editor's Cards */}
      <header className="text-center">
        <p className="text-[12px] uppercase tracking-[0.42em] text-[#7a5a3a]">
          Editor&rsquo;s Cards
        </p>
        {identityTitle && (
          <h2
            className="mt-2 text-[22px] font-medium leading-tight text-[#3d2414] md:text-[24px]"
            style={{ fontFamily: "var(--font-ridi-batang), serif" }}
          >
            {trimQuotes(identityTitle)}
          </h2>
        )}
        {session.topValue && (
          <p className="mt-2 text-[14px] tracking-[0.16em] text-[#7a5a3a]">
            {session.topValue}
            {josa(session.topValue, "을/를")} 가장 소중히 여기는 {session.gender || "그"}
          </p>
        )}
      </header>

      <div className="my-2 mx-auto h-px w-16 bg-[#b99b6b]/55" />

      {/* 카드 그리드 — v1과 동일 구조 */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                className="mt-2 text-[15px] italic leading-relaxed text-[#5a3d22]"
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
              className="text-[15px] leading-relaxed text-[#3d2414]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              {trimQuotes(visionSummary)}
            </ClampText>
          </PosterCard>
        )}

        {session.firstStep && (
          <PosterCard label="My Next Step" tone="gold">
            <ClampText lines={4} className="text-[15px] leading-relaxed">
              {trimQuotes(firstStepSummary)}
            </ClampText>
          </PosterCard>
        )}

        {session.supportPerson && (
          <PosterCard label="My Allies">
            <ClampText lines={4} className="text-[15px] leading-relaxed">
              {trimQuotes(supportSummary)}
            </ClampText>
          </PosterCard>
        )}

        {session.neededResource && (
          <div className="md:col-span-2">
            <PosterCard label="Required Resources">
              <ClampText lines={3} className="text-[15px] leading-relaxed">
                {trimQuotes(resourceSummary)}
              </ClampText>
            </PosterCard>
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-[#b99b6b]/35 pt-4 text-center">
        <p className="text-[12px] uppercase tracking-[0.4em] text-[#7a5a3a]">
          Editor&rsquo;s Note
        </p>
        <p
          className="mt-2 text-[15px] italic leading-relaxed text-[#5a3d22]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          본 호는 {session.name}님 한 분만을 위해 발행된 단 한 호의 매거진입니다.
          <br />
          여기 적힌 결이 — 앞으로 {session.name}님의 길에 자주 다시 펼쳐지길.
        </p>
      </section>
    </article>
  );
}

// ── 보조 컴포넌트들 (v1에서 복사 — 디자인 일관성 유지) ─────────────────

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
    <div className={`flex flex-col overflow-hidden rounded-sm border ${accent} px-4 py-3`}>
      <p className="text-[11px] uppercase tracking-[0.28em] text-[#7a5a3a]">{label}</p>
      <div className="mt-2 flex-1 overflow-hidden text-[#3d2414]">{children}</div>
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
