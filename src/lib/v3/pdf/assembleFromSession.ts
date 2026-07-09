// 한 V3Session 으로부터 PDF 렌더용 MagazineData 를 조립.
// ClosingChoiceScene(사용자 종결 페이지) 과 어드민의 "PDF 다운로드" 가 같은
// 어셈블 경로를 공유해 결과물이 항상 동일하도록 한다.
//
// 캐시 우선 정책:
//  - chapterArticles[1..4] 는 record-page 첫 도달 때 session 에 저장됨
//  - coverHeadline / editorIntro / editorOutro 는 첫 PDF 생성 때 cache 됨
//  - 캐시가 있으면 LLM 0회. 없는 항목만 호출하고 그 결과를 cachePatch 로
//    호출자에게 돌려준다 (호출자가 session.patch 로 저장).

import type { V3Session } from "@/lib/v3/scenes/types";
import { llm } from "@/lib/v3/llm";
import { cleanArticleField } from "@/lib/v3/llm/articleSanitize";
import { buildAppendixThreads } from "@/lib/v3/pdf/buildAppendix";
import type { MagazineData } from "@/lib/v3/pdf/MagazinePDF";

export interface AssembleResult {
  data: MagazineData;
  /** 이번 어셈블에서 새로 만든 필드들 — 호출자가 patch 해서 캐시화. */
  cachePatch: Partial<Pick<V3Session, "coverHeadline" | "editorIntro" | "editorOutro" | "chapterArticles">>;
}

type Article = { headline: string; body: string; pullQuote: string | null };

const isUsable = (a: Article | undefined): a is Article =>
  !!a && !!a.headline?.trim() && !!a.body?.trim();

const cleanArticle = (a: Article): Article => ({
  headline: cleanArticleField(a.headline),
  body: cleanArticleField(a.body),
  pullQuote: a.pullQuote ? cleanArticleField(a.pullQuote) || null : null,
});

export async function assembleMagazineDataFromSession(session: V3Session): Promise<AssembleResult> {
  const cachedArticles = session.chapterArticles ?? {};
  const cachePatch: AssembleResult["cachePatch"] = {};

  // Front/back matter — 캐시 있으면 그대로, 없으면 LLM 호출 후 cachePatch 에 담음.
  const needCover = !session.coverHeadline?.trim();
  const needIntro = !session.editorIntro?.trim();
  const needOutro = !session.editorOutro?.trim();

  // Chapter articles 1..4 — 이미 캐시된 건 그대로, 비어있는 건 LLM 호출.
  const needArticle = ([1, 2, 3, 4] as const).filter((n) => !isUsable(cachedArticles[n]));

  const [coverHeadline, editorIntro, editorOutro, ...freshArticles] = await Promise.all([
    needCover ? llm.writeCoverHeadline({ session }) : Promise.resolve(session.coverHeadline),
    needIntro ? llm.writeEditorNote({ session, kind: "intro" }) : Promise.resolve(session.editorIntro),
    needOutro ? llm.writeEditorNote({ session, kind: "outro" }) : Promise.resolve(session.editorOutro),
    ...needArticle.map((n) =>
      llm.writeChapterArticle({
        name: session.name,
        gender: session.gender,
        job: session.job,
        chapter: n,
        session,
      }),
    ),
  ]);

  if (needCover) cachePatch.coverHeadline = coverHeadline;
  if (needIntro) cachePatch.editorIntro = editorIntro;
  if (needOutro) cachePatch.editorOutro = editorOutro;

  // 결과 articles 조합: 캐시 우선, 필요했던 것은 freshArticles 에서 꺼냄.
  const articles: Record<number, Article> = { ...cachedArticles };
  let freshIdx = 0;
  for (const n of needArticle) {
    articles[n] = freshArticles[freshIdx++];
  }
  if (needArticle.length > 0) {
    // 새로 생성한 게 있으면 chapterArticles 도 cachePatch 에 포함.
    cachePatch.chapterArticles = articles;
  }

  return {
    data: {
      name: session.name,
      date: new Date().toISOString().slice(0, 10),
      coverHeadline,
      editorIntro,
      editorOutro,
      chapters: {
        1: cleanArticle(articles[1]),
        2: cleanArticle(articles[2]),
        3: cleanArticle(articles[3]),
        4: cleanArticle(articles[4]),
      },
      appendix: buildAppendixThreads(session),
    },
    cachePatch,
  };
}
