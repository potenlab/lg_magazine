"use client";

import type { ReactNode } from "react";
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
import { buildV3ChapterThreads } from "@/lib/v3/session/adminView";
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
  // 0, 1 = chapter spreads / 2 = cards spread (Editor's Cards + Editor's Note) / 3 = Appendix (별첨)
  const [page, setPage] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  // Fetch only missing chapters. Already-cached chapters render immediately.
  // 빈 body 가 캐시된 경우(과거 LLM 호출이 빈 응답이었거나 캐시 logic 가 잘못
  // 저장된 케이스)에도 missing 으로 간주해 재호출 — 매거진/PDF 에서 한 챕터만
  // 비어 나오는 회귀 방지.
  useEffect(() => {
    let cancelled = false;
    const isEmpty = (a: Article | undefined) =>
      !a || !a.headline?.trim() || !a.body?.trim();
    const missing: Chapter[] = ([1, 2, 3, 4] as Chapter[]).filter((c) =>
      isEmpty(articles[c]),
    );
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
      // 빈 응답(headline/body 비어 있음) 은 캐시 금지 — 다음 진입 때 다시 호출되도록.
      const patchArticles: Record<number, Article> = {};
      for (const [c, r] of results) {
        if (r && r.headline?.trim() && r.body?.trim()) patchArticles[c] = r;
      }
      setArticles({ ...articles, ...patchArticles });
      if (Object.keys(patchArticles).length > 0) {
        patch({ chapterArticles: { ...session.chapterArticles, ...patchArticles } });
      }
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
    if (page < 3) {
      setPage(((page + 1) as 0 | 1 | 2 | 3));
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
      setPage(((page - 1) as 0 | 1 | 2 | 3));
      const root = document.getElementById("magazine-spread-root");
      if (root) root.scrollTop = 0;
    }
  };

  const buttonLabel =
    page < 3 ? "다음 페이지" : spec.buttonLabel ?? "이 호를 닫을게요";
  const pageIndicator = `${page + 1} / 4`;

  return (
    // 다른 스크롤 씬과 동일 3-영역 패턴: 헤더(정적) / 본문(스크롤) / 푸터(정적).
    // wrapper 는 overflow-hidden, 중간만 overflow-y-auto.
    <div className="flex h-full w-full flex-1 flex-col">
      {/* ── 매거진 마스트헤드 (정적) ─────────────────────────────────── */}
      <header className="shrink-0 text-center">
        <p className="text-[14px] tracking-[0.2em] text-[#7a5a3a]">
          MAGAZINE STORY · VOL. {session.name.toUpperCase() || "?"}
        </p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span className="text-[14px] tracking-[0.14em] text-[#9a7b4c]">{pageIndicator}</span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>
      </header>

      {/* ── 스프레드 본문 (스크롤) ─────────────────────────────────── */}
      <div id="magazine-spread-root" className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            className={page === 2 ? "h-full" : undefined}
          >
            {page < 2 ? (
              <ChapterSpread
                left={SPREADS[page].left}
                right={SPREADS[page].right}
                articles={articles}
              />
            ) : page === 2 ? (
              <CardsSpread session={session} />
            ) : (
              <AppendixSpread session={session} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── 푸터 (정적, 항상 보임) — 다른 씬과 동일 톤. border-t·`←` 제거. */}
      <div className="shrink-0 mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={page === 0}
          className="flex h-[44px] items-center italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414] disabled:opacity-30"
        >
          이전
        </button>
        <StoryButtonV3
          key={`adv-${page}`}
          label={buttonLabel}
          onClick={handleNext}
          ritual
        />
      </div>
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
  const identityTitle = extractIdentityTitle(session.identityName);
  const visionSummary = toAnchorSummary(session.visionLine, 84);
  const values = session.selectedValues.filter(Boolean);
  const valuesText = values.join(" · ");
  const valuesJosaWord = values[values.length - 1] ?? session.topValue;

  return (
    <article className="flex h-full min-h-full flex-col justify-center space-y-5">
      {/* 표제 — Editor's Cards. 정체성 → 가치 → 5년 비전이 한 문장 흐름으로 이어진다. */}
      <header className="text-center">
        <p className="text-[14px] uppercase tracking-[0.2em] text-[#7a5a3a]">
          Editor&rsquo;s Cards
        </p>

        {/* 여백을 줄여 완성도 올림. 정체성/본문에 word-break:keep-all 적용해
            한국어 단어가 중간에서 끊기지 않게 한다 (Tailwind `break-keep`). */}
        <div className="py-8">
          {identityTitle && (
            <h2
              className="mx-auto max-w-[600px] break-keep text-[22px] font-medium leading-[1.5] text-[#3d2414] md:text-[24px]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              {trimQuotes(identityTitle)}
            </h2>
          )}
          {(values.length > 0 || session.visionLine) && (
            <p
              className="mx-auto mt-5 max-w-[640px] break-keep text-[16px] leading-[1.85] text-[#3d2414]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              {values.length > 0 && (
                <>
                  {valuesText}
                  {josa(valuesJosaWord, "을/를")} 가장 소중히 여기는{" "}
                  {session.gender || "그"}
                  {session.visionLine ? "," : "."}
                  <br />
                </>
              )}
              {session.visionLine && (
                <>{trimQuotes(visionSummary)} 길을 그리고 있다.</>
              )}
            </p>
          )}
        </div>
      </header>

      <section className="mt-4 border-t border-[#b99b6b]/35 pt-4 text-center">
        <p className="text-[14px] uppercase tracking-[0.2em] text-[#7a5a3a]">
          Editor&rsquo;s Note
        </p>
        <p
          className="mx-auto mt-2 max-w-[560px] break-keep text-[15px] italic leading-relaxed text-[#5a3d22]"
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

function trimQuotes(s: string): string {
  return s.trim().replace(/^["'`「」“”‘’]+/, "").replace(/["'`「」“”‘’]+$/, "");
}

/** ── 별첨 (Appendix) — 매거진 후면 페이지 ────────────────────────────
 *
 *  Editor's Note 뒷면에 한 번에 모아 보여주는 "내가 적은 기록" 페이지.
 *  buildV3ChapterThreads 를 재사용해 어드민/기록 패널과 동일한 데이터 소스를
 *  사용한다. MagazineHandoffScene 의 접이식 ChapterAttachment 와 같은 패턴이지만
 *  여기서는 매거진 한 페이지로 펼쳐서 보여준다.
 *
 *  렌더 규칙:
 *   - 질문(tone: "question") — 이탤릭, 작게, 답변이 없으면 숨김
 *   - 답변(tone: "answer" / "followup") — 본문 톤
 *   - 결과(tone: "result") — 베이지 박스
 */
function AppendixSpread({ session }: { session: V3Session }) {
  const threads = buildV3ChapterThreads(session).filter((t) =>
    t.entries.some((e) => e.text && e.text.trim().length > 0),
  );

  return (
    <article className="space-y-6">
      <header className="text-center">
        <p className="text-[14px] uppercase tracking-[0.2em] text-[#7a5a3a]">Appendix</p>
        <h2
          className="mt-2 text-[20px] font-medium text-[#3d2414] md:text-[22px]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          내가 적은 기록
        </h2>
        <p className="mt-2 text-[15px] italic leading-[1.7] text-[#8b7050]">
          네 챕터에서 주고받은 질문 · 답변 · 편집장 요약을 한 자리에 모아둔 페이지예요.
        </p>
        <div className="mx-auto mt-4 h-px w-20 bg-[#b99b6b]/40" />
      </header>

      {threads.length === 0 ? (
        <p className="text-center text-[14px] italic text-[#8b7050]">
          기록할 답변이 아직 없어요.
        </p>
      ) : (
        <div className="space-y-8">
          {threads.map((thread) => {
            // 질문이 있는데 답이 비어있는 페어는 숨김 (UX: 빈 질문 노출 방지).
            const entries = thread.entries.filter((e, i, arr) => {
              if (!e.text || e.text.trim().length === 0) return false;
              if (e.tone === "question") {
                const next = arr[i + 1];
                const answered = next?.text && next.text.trim().length > 0;
                if (!answered) return false;
              }
              return true;
            });
            if (entries.length === 0) return null;
            return (
              <section key={thread.chapter} className="space-y-3">
                <div className="border-b border-[#b99b6b]/30 pb-2">
                  <p className="text-[14px] uppercase tracking-[0.14em] text-[#9b8768]">
                    {thread.chapter}
                  </p>
                  <h3
                    className="mt-0.5 text-[19px] font-semibold text-[#3d2414]"
                    style={{ fontFamily: "var(--font-ridi-batang), serif" }}
                  >
                    {thread.title}
                  </h3>
                </div>
                <div className="space-y-2.5">
                  {entries.map((entry, i) => {
                    const isQuestion = entry.tone === "question";
                    const isResult = entry.tone === "result";
                    const boxClass = isQuestion
                      ? "rounded-md border-l-[3px] border-[#b99b6b] bg-transparent px-3 py-1.5"
                      : isResult
                        ? "rounded-md border border-[#d7bd83]/40 bg-[#ede1c6]/40 px-3 py-2.5"
                        : "rounded-md border border-[#b99b6b]/30 bg-white/55 px-3 py-2.5";
                    const labelClass = isQuestion
                      ? "text-[14px] uppercase tracking-[0.08em] text-[#9b8768]"
                      : "text-[14px] tracking-wide text-[#8b7050]";
                    const textClass = isQuestion
                      ? "mt-1 whitespace-pre-wrap text-[15px] italic leading-[1.6] text-[#6b5337]"
                      : isResult
                        ? "mt-1 whitespace-pre-wrap text-[16px] leading-[1.7] text-[#3d2414]"
                        : "mt-1 whitespace-pre-wrap text-[16px] leading-[1.7] text-[#3d2414]";
                    return (
                      <div key={i} className={boxClass}>
                        <p className={labelClass}>{entry.label}</p>
                        <p className={textClass}>{entry.text}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 매거진 후면 마무리 — 페이지 닫힘 톤 */}
      <footer className="mt-6 border-t border-[#b99b6b]/35 pt-4 text-center">
        <p
          className="text-[14px] italic text-[#8b7050]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          — {session.name}님이 직접 적어주신 기록 —
        </p>
      </footer>
    </article>
  );
}
