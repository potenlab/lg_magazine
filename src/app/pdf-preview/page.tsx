"use client";

/**
 * 매거진 PDF 라이브 프리뷰.
 * 페이지별 탭 + sample data 로 즉시 iframe 렌더 — 풀 세션 거치지 않고
 * 레이아웃·여백·폰트 미세조정 빠르게 보기 위한 dev 도구.
 *
 * 접근: dev 서버에서 `/pdf-preview`.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Document } from "@react-pdf/renderer";
import { Cover } from "@/lib/v3/pdf/pages/Cover";
import { TOC } from "@/lib/v3/pdf/pages/TOC";
import { EditorIntro } from "@/lib/v3/pdf/pages/EditorIntro";
import { Chapter } from "@/lib/v3/pdf/pages/Chapter";
import { EditorOutro } from "@/lib/v3/pdf/pages/EditorOutro";
import { registerPdfFonts } from "@/lib/v3/pdf/fonts";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false },
);

const SAMPLE = {
  name: "홍길동",
  date: "2026-06-01",
  coverHeadline: "항로를 그리는 사람의 지도",
  editorIntro:
    "지난 한 시간 동안 들려주신 이야기를 모았어요. 이 호는 오직 한 사람, 홍길동님을 위한 단 한 권의 매거진입니다.",
  editorOutro:
    "매거진을 닫으며 — 다시 길을 잃은 듯한 날에는 이 호를 펼쳐 보세요.",
  chapters: {
    1: {
      headline: "내가 지나온 길",
      body: "샘플 본문입니다. 실제 세션에서는 LLM 이 합성한 본문이 들어옵니다. 두세 단락 정도 분량으로 페이지를 채우게 됩니다.\n\n두 번째 단락. 챕터별 분위기와 톤을 미리 확인하는 용도.",
      pullQuote: "한 줄 인용 — 챕터의 키워드.",
    },
    2: {
      headline: "나는 누구인가",
      body: "샘플 본문. Ch2 는 강점·가치 합성 톤.",
      pullQuote: null,
    },
    3: {
      headline: "내가 그리는 미래",
      body: "샘플 본문. Ch3 은 비전·방향 합성 톤.",
      pullQuote: "내가 향하는 길의 한 줄.",
    },
    4: {
      headline: "내일로 향하는 한 걸음",
      body: "샘플 본문. Ch4 는 도구·실천 합성 톤.",
      pullQuote: null,
    },
  },
} as const;

type PageKey = "cover" | "toc" | "editorIntro" | "ch1" | "ch2" | "ch3" | "ch4" | "editorOutro" | "all";

const TABS: { key: PageKey; label: string }[] = [
  { key: "cover", label: "Cover" },
  { key: "toc", label: "TOC" },
  { key: "editorIntro", label: "Editor Intro" },
  { key: "ch1", label: "Ch 1" },
  { key: "ch2", label: "Ch 2" },
  { key: "ch3", label: "Ch 3" },
  { key: "ch4", label: "Ch 4" },
  { key: "editorOutro", label: "Editor Outro" },
  { key: "all", label: "전체" },
];

export default function PdfPreviewPage() {
  const [page, setPage] = useState<PageKey>("cover");
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    registerPdfFonts();
    setFontsReady(true);
  }, []);

  const doc = useMemo(() => {
    if (!fontsReady) return null;
    const ch = (n: 1 | 2 | 3 | 4) => (
      <Chapter
        chapter={n}
        headline={SAMPLE.chapters[n].headline}
        body={SAMPLE.chapters[n].body}
        pullQuote={SAMPLE.chapters[n].pullQuote}
      />
    );
    const pages = (() => {
      switch (page) {
        case "cover":
          return <Cover name={SAMPLE.name} date={SAMPLE.date} headline={SAMPLE.coverHeadline} />;
        case "toc":
          return <TOC deep={false} />;
        case "editorIntro":
          return <EditorIntro body={SAMPLE.editorIntro} name={SAMPLE.name} />;
        case "ch1":
          return ch(1);
        case "ch2":
          return ch(2);
        case "ch3":
          return ch(3);
        case "ch4":
          return ch(4);
        case "editorOutro":
          return <EditorOutro body={SAMPLE.editorOutro} name={SAMPLE.name} date={SAMPLE.date} />;
        case "all":
          return (
            <>
              <Cover name={SAMPLE.name} date={SAMPLE.date} headline={SAMPLE.coverHeadline} />
              <TOC deep={false} />
              <EditorIntro body={SAMPLE.editorIntro} name={SAMPLE.name} />
              {ch(1)}
              {ch(2)}
              {ch(3)}
              {ch(4)}
              <EditorOutro body={SAMPLE.editorOutro} name={SAMPLE.name} date={SAMPLE.date} />
            </>
          );
      }
    })();
    return <Document title="STORY Preview">{pages}</Document>;
  }, [page, fontsReady]);

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1c130c", color: "#f5ead6" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid #3d2414", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ marginRight: 12, fontSize: 14 }}>PDF Preview</strong>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setPage(t.key)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid #b99b6b",
              background: page === t.key ? "#b99b6b" : "transparent",
              color: page === t.key ? "#1c130c" : "#f5ead6",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>
          sample: {SAMPLE.name} / {SAMPLE.date}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {doc && (
          <PDFViewer width="100%" height="100%" style={{ border: "none" }} showToolbar>
            {doc}
          </PDFViewer>
        )}
      </div>
    </main>
  );
}
