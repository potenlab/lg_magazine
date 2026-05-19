"use client";

import { EditorialInline } from "@/components/v3/ui/EditorialText";
import { firstParagraphWithDropCap } from "@/lib/v3/pdf/dropcap";

/**
 * 매거진 한 페이지(article) 렌더링 — 챕터 라벨 + 헤드라인 + 드롭캡 본문 + pullQuote.
 *
 * RecordPageScene(2-11 등 챕터별 단독 article)과 MagazinePosterScene(합본 매거진의
 * 좌·우 페이지)에서 모두 같은 룩으로 보여주기 위해 추출. props로 chapter 번호와
 * article(headline/body/pullQuote)만 받고, 데이터 fetch/세션 관리는 호출 측 책임.
 *
 * height/scroll은 부모가 정하도록 의도적으로 비워둠. 합본 매거진에서는 양쪽 페이지
 * 키를 맞추기 위해 부모가 `h-` 를 박고, 단독 페이지에서는 자연 흐름.
 */
export function MagazineArticlePage({
  chapter,
  article,
  /** Pullquote 보일지 — 합본 매거진에서는 카드 호흡상 생략하고 싶을 때 false. */
  showPullQuote = true,
}: {
  chapter: 1 | 2 | 3 | 4;
  article: { headline: string; body: string; pullQuote: string | null };
  showPullQuote?: boolean;
}) {
  return (
    <div className="space-y-5">
      <p className="text-[16px] uppercase tracking-[0.28em] text-[#9a7b4c]">
        Chapter {chapter}
      </p>
      <h2 className="font-serif text-2xl italic text-[#3d2414]">{article.headline}</h2>
      <div className="my-2 h-px w-12 bg-[#b99b6b]" />
      <div className="text-[#3d2414] leading-[1.95]">
        {firstParagraphWithDropCap(article.body)}
      </div>
      {showPullQuote && article.pullQuote && (
        <figure className="relative my-8 mx-auto max-w-md text-center">
          <span aria-hidden className="absolute -top-4 left-0 font-serif text-5xl text-[#b99b6b]/60">
            ❝
          </span>
          <blockquote className="px-8 font-serif text-xl italic leading-[1.6] text-[#3d2414]">
            {article.pullQuote}
          </blockquote>
          <span aria-hidden className="absolute -bottom-2 right-0 font-serif text-5xl text-[#b99b6b]/60">
            ❞
          </span>
        </figure>
      )}
    </div>
  );
}

/** 로딩 중 placeholder — article 데이터를 fetch 중일 때 같은 자리에 자연스럽게. */
export function MagazineArticleLoading({ chapter }: { chapter: 1 | 2 | 3 | 4 }) {
  return (
    <div className="space-y-5">
      <p className="text-[16px] uppercase tracking-[0.28em] text-[#9a7b4c]/60">
        Chapter {chapter}
      </p>
      <p className="text-[16px] italic text-[#8b7050]">
        매거진 페이지를 정리하고 있어요…
      </p>
    </div>
  );
}

/**
 * BEAT 카테고리 한 페이지 — Chapter article과 유사한 룩이지만 카테고리 라벨 +
 * 본문 한 문단. synthesis 결과 BEAT (Chapter 2 강점 종합, Chapter 3 성장 비전
 * 종합)를 합본 매거진 스프레드의 좌·우 페이지로 보여줄 때 사용.
 *
 * 룩:
 *   "01" (큰 숫자, gold)         ← 페이지 번호
 *   ─────                        ← gold rule
 *   두 몰입 순간                  ← 카테고리 제목 (italic serif)
 *   본문 문단 …                  ← BEAT 본문 (드롭캡 없음, 한 문단 통째)
 */
export function MagazineBeatPage({
  number,
  category,
  body,
}: {
  /** 페이지 번호 ("01", "02", ...). 큰 숫자로 prominent하게 표시. */
  number: string;
  /** 카테고리 이름 ("두 몰입 순간" 등) — italic serif 헤드라인 자리. */
  category: string;
  /** BEAT 본문 — 한 문단 (Chapter article과 달리 짧음). */
  body: string;
}) {
  return (
    <div className="space-y-3">
      <p
        className="font-serif text-5xl leading-none text-[#9a7b4c]"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {number}
      </p>
      <div className="h-px w-12 bg-[#b99b6b]" />
      <h3
        className="font-serif text-xl italic text-[#3d2414]"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {category}
      </h3>
      <p className="pt-1 text-[16px] leading-[1.85] text-[#3d2414]">
        <EditorialInline text={body} />
      </p>
    </div>
  );
}

/** BEAT 페이지 로딩 placeholder. */
export function MagazineBeatLoading({ number, category }: { number: string; category: string }) {
  return (
    <div className="space-y-3">
      <p
        className="font-serif text-5xl leading-none text-[#9a7b4c]/40"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {number}
      </p>
      <div className="h-px w-12 bg-[#b99b6b]/40" />
      <h3
        className="font-serif text-xl italic text-[#3d2414]/40"
        style={{ fontFamily: "var(--font-ridi-batang), serif" }}
      >
        {category}
      </h3>
      <p className="pt-1 text-[16px] italic leading-[1.85] text-[#8b7050]">
        편집장이 정리하고 있어요…
      </p>
    </div>
  );
}
