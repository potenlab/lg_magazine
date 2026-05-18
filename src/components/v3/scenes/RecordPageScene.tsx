"use client";

import { useEffect, useState } from "react";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";
import { firstParagraphWithDropCap } from "@/lib/v3/pdf/dropcap";

function chapterFromSceneId(id: string): 1 | 2 | 3 | 4 {
  if (id.startsWith("2")) return 2;
  if (id.startsWith("3")) return 3;
  if (id.startsWith("4")) return 4;
  return 1;
}

export function RecordPageScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const chapter = chapterFromSceneId(spec.id);
  const cached = session.chapterArticles?.[chapter];
  const [art, setArt] = useState<{ headline: string; body: string; pullQuote: string | null } | null>(
    cached ?? null,
  );

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    (async () => {
      const r = await llm.writeChapterArticle({
        name: session.name,
        gender: session.gender,
        job: session.job,
        chapter,
        session,
      });
      if (cancelled) return;
      setArt(r);
      patch({
        chapterArticles: { ...session.chapterArticles, [chapter]: r },
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  if (!art) return <p className="italic text-[#8b7050]">매거진 페이지를 정리하고 있어요…</p>;

  return (
    // min-h-0 lets flex-1 actually shrink the article down to the card's
    // bounds; without it the default `min-height: auto` makes the flex
    // child grow to its content size and the article body visibly bleeds
    // past the dialog card boundary onto the train interior background.
    <article className="flex min-h-0 flex-1 flex-col">
      {/* Scroll lives on the content viewport, not on the outer card —
          friend's new full-height card class doesn't always clip cleanly
          on the article + drop-cap float combo. Pinning the scroll here
          keeps overflow inside the cream paper no matter what. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <p className="text-[12px] uppercase tracking-[0.28em] text-[#9a7b4c]">Chapter {chapter}</p>
        <h2 className="font-serif text-2xl italic text-[#3d2414]">{art.headline}</h2>
        <div className="my-2 h-px w-12 bg-[#b99b6b]" />
        <div className="text-[#3d2414] leading-[1.95]">
          {firstParagraphWithDropCap(art.body)}
        </div>
        {art.pullQuote && (
          <figure className="relative my-8 mx-auto max-w-md text-center">
            <span aria-hidden className="absolute -top-4 left-0 font-serif text-5xl text-[#b99b6b]/60">❝</span>
            <blockquote className="px-8 font-serif text-xl italic leading-[1.6] text-[#3d2414]">
              {art.pullQuote}
            </blockquote>
            <span aria-hidden className="absolute -bottom-2 right-0 font-serif text-5xl text-[#b99b6b]/60">❞</span>
          </figure>
        )}
      </div>
      <div className="mt-3 flex justify-end border-t border-[#d7bd83]/20 pt-3">
        <StoryButtonV3 label={spec.buttonLabel ?? "잘 읽었어요"} onClick={advance} />
      </div>
    </article>
  );
}
