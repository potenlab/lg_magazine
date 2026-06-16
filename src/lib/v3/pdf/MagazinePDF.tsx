import { Document } from "@react-pdf/renderer";
import { Cover } from "./pages/Cover";
import { TOC } from "./pages/TOC";
import { EditorIntro } from "./pages/EditorIntro";
import { Chapter } from "./pages/Chapter";
import { EditorOutro } from "./pages/EditorOutro";
import { BackPage } from "./pages/BackPage";

export interface MagazineData {
  name: string;
  date: string;
  coverHeadline: string;
  editorIntro: string;
  editorOutro: string;
  chapters: {
    1: { headline: string; body: string; pullQuote: string | null };
    2: { headline: string; body: string; pullQuote: string | null };
    3: { headline: string; body: string; pullQuote: string | null };
    4: { headline: string; body: string; pullQuote: string | null };
  };
}

export function MagazinePDF({ data, deep = false }: { data: MagazineData; deep?: boolean }) {
  return (
    <Document title={`STORY Vol. ${data.name}`} author="Magazine STORY 편집부">
      <Cover name={data.name} date={data.date} headline={data.coverHeadline} />
      <EditorIntro body={data.editorIntro} name={data.name} />
      <TOC name={data.name} deep={deep} />
      <Chapter chapter={1} headline={data.chapters[1].headline} body={data.chapters[1].body} pullQuote={data.chapters[1].pullQuote} name={data.name} />
      <Chapter chapter={2} headline={data.chapters[2].headline} body={data.chapters[2].body} pullQuote={data.chapters[2].pullQuote} name={data.name} />
      <Chapter chapter={3} headline={data.chapters[3].headline} body={data.chapters[3].body} pullQuote={data.chapters[3].pullQuote} name={data.name} deep={deep} />
      <Chapter chapter={4} headline={data.chapters[4].headline} body={data.chapters[4].body} pullQuote={data.chapters[4].pullQuote} name={data.name} />
      <EditorOutro body={data.editorOutro} name={data.name} />
      <BackPage name={data.name} date={data.date} />
    </Document>
  );
}
