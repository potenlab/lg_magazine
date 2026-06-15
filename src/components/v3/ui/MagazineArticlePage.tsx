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
      <p className="text-[16px] uppercase tracking-[0.14em] text-[#9a7b4c]">
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
      <p className="text-[16px] uppercase tracking-[0.14em] text-[#9a7b4c]/60">
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
 * 룩 (v3 — 2026-05-19 매거진 톤 강화):
 *   "01" (큰 숫자, gold)              ← 페이지 번호
 *   ─                                  ← gold rule
 *   두 몰입의 순간 · 카테고리          ← 작은 부제 (uppercase letter-spaced)
 *   판을 짜고 결과를 만드는 사람       ← LLM-generated 헤드라인 (큰 italic serif)
 *   본문 문단 (with **bold** 강조)     ← BEAT 본문, key phrase는 굵게
 *
 * body는 LLM 출력에서 `[HEADLINE: ...]` 마커를 떼고 남은 텍스트.
 * headline은 별도로 parser가 추출해서 props로 전달.
 */
export function MagazineBeatPage({
  number,
  category,
  body,
  headline,
}: {
  /** 페이지 번호 ("01", "02", ...). 큰 숫자로 prominent하게 표시. */
  number: string;
  /** 카테고리 이름 ("두 몰입 순간" 등) — 작은 uppercase 부제. */
  category: string;
  /** BEAT 본문 — 한 문단 (Chapter article과 달리 짧음). **bold** 마크다운 지원. */
  body: string;
  /** LLM이 생성한 매거진 헤드라인 ("판을 짜고 결과를 만드는 사람"). 없으면 카테고리만. */
  headline?: string;
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
      <p className="text-[14px] uppercase tracking-[0.08em] text-[#9b8768]">
        {category}
      </p>
      {headline && (
        <h3
          className="font-serif text-[22px] italic leading-snug text-[#3d2414]"
          style={{ fontFamily: "var(--font-ridi-batang), serif" }}
        >
          {headline}
        </h3>
      )}
      <p className="pt-1 text-[16px] leading-[1.85] text-[#3d2414]">
        <BoldMarkdown text={body} />
      </p>
    </div>
  );
}

/** 본문 안의 `**xxx**` 마크다운 → <strong>xxx</strong> 변환.
 *  매거진 본문에서 LLM이 강조한 핵심 takeaway phrase를 굵게 렌더링하기 위해.
 *  EditorialInline의 다른 후처리(작은따옴표 변환 등)는 굳이 필요 없어 단순 구현. */
function BoldMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\*\*([\s\S]+)\*\*$/);
        if (m) {
          return (
            <strong key={i} className="font-semibold text-[#3d2414]">
              {m[1]}
            </strong>
          );
        }
        return <EditorialInline key={i} text={part} />;
      })}
    </>
  );
}

/** LLM synthesis 텍스트(`[HEADLINE: ...] body`)에서 headline + body 분리.
 *  헤드라인이 없으면 headline은 undefined, body는 원본 그대로.
 *  헤드라인과 본문 사이가 줄바꿈(\n)으로 분리돼 있어도 정상 파싱한다. */
export function parseBeat(raw: string): { headline?: string; body: string } {
  const trimmed = raw.trim();
  // 헤드라인 + (공백/줄바꿈) + 본문. 본문이 비어도 매칭은 되고, 본문은 빈 문자열로 반환.
  const m = trimmed.match(/^\[HEADLINE:\s*(.+?)\]\s*([\s\S]*)$/);
  if (m) {
    return { headline: m[1].trim(), body: m[2].trim() };
  }
  return { body: trimmed };
}

/** synthesis 전체 텍스트에서 BEAT 4개를 견고하게 추출.
 *  - LLM이 `[HEADLINE: H] body\n[HEADLINE: H] body` 한 줄당 한 BEAT로 줘도 OK
 *  - `[HEADLINE: H]\nbody\n[HEADLINE: H]\nbody` 헤드라인-본문 줄 분리 형식도 OK
 *  - 헤드라인 마커로 split하므로 본문 안에 줄바꿈이 있어도 안전. */
export function parseBeats(synthesis: string, count = 4): { headline?: string; body: string }[] {
  const text = synthesis.trim();
  if (!text) return [];
  // 1) 헤드라인 마커 기준으로 자르기. 헤드라인이 있으면 무조건 새 BEAT 시작.
  if (text.includes("[HEADLINE:")) {
    const chunks = text
      .split(/(?=\[HEADLINE:)/g)
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, count);
    return chunks.map((c) => parseBeat(c));
  }
  // 2) 헤드라인 마커가 없으면 옛 데이터 — 줄 단위로 자름 (백워드 호환).
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, count)
    .map((c) => parseBeat(c));
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
