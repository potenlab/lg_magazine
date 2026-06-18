import { Document } from "@react-pdf/renderer";
import { Cover } from "./pages/Cover";
import { TOC } from "./pages/TOC";
import { EditorIntro } from "./pages/EditorIntro";
import { Chapter } from "./pages/Chapter";
import { EditorOutro } from "./pages/EditorOutro";
import { Appendix, type AppendixThread } from "./pages/Appendix";
import { BackPage } from "./pages/BackPage";
import { pickRandomVariant, type ImageVariant } from "./imageSets";

export interface MagazineData {
  name: string;
  date: string;
  coverHeadline: string;
  editorIntro: string;
  editorOutro: string;
  /** Editor's Note 메인 타이틀 = 정체성 타이틀 문장. 비면 EditorOutro 가 fallback. */
  editorTitle?: string;
  chapters: {
    1: { headline: string; body: string; pullQuote: string | null };
    2: { headline: string; body: string; pullQuote: string | null };
    3: { headline: string; body: string; pullQuote: string | null };
    4: { headline: string; body: string; pullQuote: string | null };
  };
  /** 별첨 — 챕터별 질문/답변/결과 기록. 비우면 Appendix 페이지 미렌더. */
  appendix?: AppendixThread[];
}

/**
 * `variant` — 이미지 세트 (1) / (2) 중 하나. 생략 시 매 렌더마다 랜덤 픽.
 * EditorIntro / Ch2 / Ch3 hero 이미지가 세트별로 다름. Ch1·Ch4 등 variant
 * 없는 페이지는 단일 자산. 다운로드 시점마다 한 번씩 결정되어 한 호 안에서는
 * 일관됨.
 */
export function MagazinePDF({ data, variant }: { data: MagazineData; variant?: ImageVariant }) {
  const v: ImageVariant = variant ?? pickRandomVariant();
  return (
    <Document title={`STORY Vol. ${data.name}`} author="Magazine STORY 편집부">
      <Cover name={data.name} date={data.date} headline={data.coverHeadline} />
      <EditorIntro body={data.editorIntro} name={data.name} variant={v} />
      <TOC
        name={data.name}
        chapterHeadlines={[
          data.chapters[1].headline,
          data.chapters[2].headline,
          data.chapters[3].headline,
          data.chapters[4].headline,
        ]}
      />
      <Chapter chapter={1} headline={data.chapters[1].headline} body={data.chapters[1].body} pullQuote={data.chapters[1].pullQuote} name={data.name} variant={v} />
      <Chapter chapter={2} headline={data.chapters[2].headline} body={data.chapters[2].body} pullQuote={data.chapters[2].pullQuote} name={data.name} variant={v} />
      <Chapter chapter={3} headline={data.chapters[3].headline} body={data.chapters[3].body} pullQuote={data.chapters[3].pullQuote} name={data.name} variant={v} />
      <Chapter chapter={4} headline={data.chapters[4].headline} body={data.chapters[4].body} pullQuote={data.chapters[4].pullQuote} name={data.name} variant={v} />
      <EditorOutro title={data.editorTitle} body={data.editorOutro} name={data.name} />
      {data.appendix && data.appendix.length > 0 && (
        <Appendix name={data.name} threads={data.appendix} />
      )}
      <BackPage name={data.name} date={data.date} />
    </Document>
  );
}
