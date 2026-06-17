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
import type { ImageVariant } from "@/lib/v3/pdf/imageSets";
import { EditorOutro } from "@/lib/v3/pdf/pages/EditorOutro";
import { Appendix, type AppendixThread } from "@/lib/v3/pdf/pages/Appendix";
import { BackPage } from "@/lib/v3/pdf/pages/BackPage";
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
    "지난 한 시간 동안 들려주신 이야기를 모았어요. 이 호는 오직 한 사람, 홍길동님을 위한 단 한 권의 매거진입니다. 페이지를 펼치는 순간 그날의 대화가 다시 살아나길 바라며, 한 줄 한 줄에 그 시간을 담았습니다.",
  editorOutro:
    "우리는 묵묵히 자기 빛을 쌓아온 한 사람을 만났다. 그의 이야기를 들으며, 우리는 그가 이미 '삶의 주인공은 나여야 한다'는 자기만의 답을 가지고 있음을 깨달았다. 다만 그 답이 아직 매일의 습관으로 내려앉지 못했을 뿐이라는 걸. 이 한 호가 그의 다음 여정에 작은 등불이 되기를.",
  chapters: {
    1: {
      headline: "내가 지나온 길",
      body: "홍길동님은 스무 살 여름, 일산 호수공원에서 자전거 대여 사업을 시작했다. 당시 시급이 4천 원도 안 되던 시절, 하루에 50만 원을 벌어본 경험이 있었다. 그날 그는 '사업가의 피가 흐른다'는 것을 처음으로 느꼈다.\n\n몇 년 후, 200명이 넘는 대외활동 참가자 중 4명의 우수활동자로 선정되었다. 장학금을 받고 중국 탐방을 다녀온 그는 자신이 '생각보다 특별한 사람'이라는 사실을 깨달았다고 말했다.\n\n두 장면은 서로 연결된 느낌을 주었다. 막연한 자신감이 아닌, 명확한 숫자와 성과로 자신의 존재를 확실히 느끼는 순간이었다. 그에게 증명은 단순한 결과가 아니라, 자신이 누구인지 확인하는 방법처럼 보였다.",
      pullQuote: "하루에 50만원 벌어본 적도 있어. 그래서 나도 사업가의 피가 흐른다는 것을 느꼈지",
    },
    2: {
      headline: "나는 누구인가",
      body: "홍길동님은 자신을 '자신의 길을 개척하는 사람'이라고 표현했다. 그 이름은 단순한 수식어가 아니라, 매일 자신에게 던지는 질문의 다른 표현이었다.\n\n그에게 '주도성'은 추상적인 개념이 아니라 '삶 그 자체'였다. '내가 좋아하는 것과 나의 철학에 따라 행동해야 한다'는 그의 정의는, 스스로 삶의 방향을 정하지 않으면 의미가 없다는 선언처럼 들렸다.\n\n'그게 없으면 단순한 NPC에 불과하죠'라는 말에서, 그는 타인이 쓴 각본을 거부하는 사람의 모습을 드러냈다. '내 삶의 주인공은 나여야 해요'라는 문장은 그가 매일 감사일기를 쓰기로 한 이유이기도 했다.",
      pullQuote: "내 삶의 주인공은 나여야해요",
    },
    3: {
      headline: "내가 그리는 미래",
      body: "홍길동님은 자신의 경험을 바탕으로 사람들에게 방향성을 제시하는 교육 사업을 구상하고 있었다. 유튜브를 통해 사람들과 소통하며 강의를 진행하는 지금도, 그는 자신의 교육철학을 더욱 확고히 하고 있었다. '주도성'을 삶의 본질로 여기는 그에게, 이 준비는 단순한 커리어 설계가 아니라 '내 삶의 주인공은 나여야 한다'는 원칙을 실천하는 과정이었다.\n\n그가 이 길을 선택한 이유는 분명했다. '결국 살아있음을 느껴야 하니까.' 자신이 좋아하는 일을 하며 누군가에게 긍정적인 영향을 주고, 그로 인해 수익을 얻는 것이 '가장 좋은 일'이라고 그는 말했다.\n\n그는 자신의 교육철학과 사업철학을 책이나 지침서로 만들고 싶어 했다. 그리고 그것이 사람들이 '90% 이상 공감해줬으면' 좋겠다고 덧붙였다. 세상에 남기고 싶은 것은 화려한 성과가 아니라, 누군가가 자신의 삶의 방향을 설계할 때 참고할 수 있는 한 장의 지도 같은 것이었다.",
      pullQuote: "나는 방향을 설계하는 지도자처럼, 누군가의 항로에 나침반 하나를 남기고 싶다.",
    },
    4: {
      headline: "내일로 향하는 한 걸음",
      body: "홍길동님은 내일 아침부터 감사일기를 쓰기로 했다. '주도성은 삶 그 자체'라고 말했던 그는 일기를 단순한 기록이 아닌, 자신이 무엇을 좋아하고 어떤 철학으로 움직였는지를 확인하는 항해일지로 여겼다. 매일 한 줄씩 자신의 선택을 돌아보는 일이 그를 'NPC'가 아닌 '주인공'으로 만드는 첫 걸음이라고 믿었다.\n\n그는 혼자 이 길을 가지 않을 생각이었다. 교육 크리에이터들의 콘텐츠를 통해 클로드와 시간 관리, 개발 공부를 차근차근 익히고, 함께 루틴을 만들어갈 사람들을 곁에 두기로 했다. 지도자처럼 방향을 설계하는 삶은 결국 자신이 선택한 자원과 사람들과 함께 매일을 채워가는 과정이었다.\n\n그가 펜을 들었을 때, 그는 이미 출발선에 서 있었다. 내일 아침 첫 문장은 아마도 '오늘, 나는 내 삶의 항로를 그리기 시작했다'일지도 모른다는 생각이 들었다.",
      pullQuote: null,
    },
  },
} as const;

const SAMPLE_APPENDIX: AppendixThread[] = [
  {
    chapter: "Chapter 1",
    title: "내가 지나온 길",
    entries: [
      { tone: "question", label: "질문", text: "시간 가는 줄 모르고 빠져들었던 순간은?" },
      { tone: "answer", label: "첫 번째 경험", text: "스무 살 여름, 일산 호수공원에서 자전거 대여 사업을 하면서 하루에 50만 원을 벌어본 적이 있다. 그날 내가 사업가의 피가 흐른다는 걸 처음 느꼈다." },
      { tone: "answer", label: "두 번째 경험", text: "200명 대외활동 참가자 중 4명의 우수활동자로 선정되어 중국 탐방을 다녀온 경험. 내가 생각보다 특별한 사람이라는 걸 알게 된 순간." },
      { tone: "result", label: "엘아울의 한마디", text: "두 장면 모두 명확한 숫자와 성과로 자기 존재를 확인하는 순간이었어요." },
    ],
  },
  {
    chapter: "Chapter 2",
    title: "나는 누구인가",
    entries: [
      { tone: "answer", label: "선택한 가치 카드", text: "주도성, 자유, 성장" },
      { tone: "result", label: "엘아울의 발견", text: "주도성이 다른 두 가치를 떠받치는 기반처럼 보였어요. 자유는 주도성이 보장된 다음에야 의미를 가진다는 결을 읽었습니다." },
      { tone: "answer", label: "나의 정체성", text: "자신의 길을 개척하는 사람" },
    ],
  },
  {
    chapter: "Chapter 3",
    title: "내가 그리는 미래",
    entries: [
      { tone: "answer", label: "끌리는 것", text: "내 경험을 바탕으로 누군가의 방향성에 영향을 주는 일." },
      { tone: "answer", label: "이미 하고 있는 것", text: "유튜브 강의를 통해 사람들과 소통하고 있다." },
      { tone: "answer", label: "5년 후 비전", text: "내 교육철학과 사업철학을 책이나 지침서로 정리해 사람들이 자기 삶의 방향을 설계할 때 참고할 수 있는 한 장의 지도를 남기는 사람." },
    ],
  },
  {
    chapter: "Chapter 4",
    title: "내일로 향하는 한 걸음",
    entries: [
      { tone: "answer", label: "내일 아침의 작은 한 걸음", text: "매일 아침 감사일기 한 줄 쓰기." },
      { tone: "answer", label: "함께할 사람들", text: "교육 크리에이터 콘텐츠로 클로드·시간 관리·개발 공부를 함께할 동료들." },
    ],
  },
];

type PageKey =
  | "cover"
  | "toc"
  | "editorIntro"
  | "ch1"
  | "ch2"
  | "ch3"
  | "ch4"
  | "editorOutro"
  | "appendix"
  | "backPage"
  | "all";

const TABS: { key: PageKey; label: string }[] = [
  { key: "cover", label: "Cover" },
  { key: "editorIntro", label: "Editor Intro" },
  { key: "toc", label: "TOC" },
  { key: "ch1", label: "Ch 1" },
  { key: "ch2", label: "Ch 2" },
  { key: "ch3", label: "Ch 3" },
  { key: "ch4", label: "Ch 4" },
  { key: "editorOutro", label: "Editor Outro" },
  { key: "appendix", label: "Appendix" },
  { key: "backPage", label: "Back Page" },
  { key: "all", label: "전체" },
];

export default function PdfPreviewPage() {
  const [page, setPage] = useState<PageKey>("cover");
  const [variant, setVariant] = useState<ImageVariant>(1);
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
        name={SAMPLE.name}
        variant={variant}
      />
    );
    const pages = (() => {
      switch (page) {
        case "cover":
          return <Cover name={SAMPLE.name} date={SAMPLE.date} headline={SAMPLE.coverHeadline} />;
        case "toc":
          return <TOC
                name={SAMPLE.name}
                chapterHeadlines={[
                  SAMPLE.chapters[1].headline,
                  SAMPLE.chapters[2].headline,
                  SAMPLE.chapters[3].headline,
                  SAMPLE.chapters[4].headline,
                ]}
              />;
        case "editorIntro":
          return <EditorIntro body={SAMPLE.editorIntro} name={SAMPLE.name} variant={variant} />;
        case "ch1":
          return ch(1);
        case "ch2":
          return ch(2);
        case "ch3":
          return ch(3);
        case "ch4":
          return ch(4);
        case "editorOutro":
          return <EditorOutro body={SAMPLE.editorOutro} name={SAMPLE.name} />;
        case "appendix":
          return <Appendix name={SAMPLE.name} threads={SAMPLE_APPENDIX} />;
        case "backPage":
          return <BackPage name={SAMPLE.name} date={SAMPLE.date} />;
        case "all":
          return (
            <>
              <Cover name={SAMPLE.name} date={SAMPLE.date} headline={SAMPLE.coverHeadline} />
              <EditorIntro body={SAMPLE.editorIntro} name={SAMPLE.name} variant={variant} />
              <TOC
                name={SAMPLE.name}
                chapterHeadlines={[
                  SAMPLE.chapters[1].headline,
                  SAMPLE.chapters[2].headline,
                  SAMPLE.chapters[3].headline,
                  SAMPLE.chapters[4].headline,
                ]}
              />
              {ch(1)}
              {ch(2)}
              {ch(3)}
              {ch(4)}
              <EditorOutro body={SAMPLE.editorOutro} name={SAMPLE.name} />
              <Appendix name={SAMPLE.name} threads={SAMPLE_APPENDIX} />
              <BackPage name={SAMPLE.name} date={SAMPLE.date} />
            </>
          );
      }
    })();
    return <Document title="STORY Preview">{pages}</Document>;
  }, [page, fontsReady, variant]);

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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.6, marginRight: 6 }}>
            sample: {SAMPLE.name} / {SAMPLE.date}
          </span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>이미지 세트:</span>
          {([1, 2] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid #b99b6b",
                background: variant === v ? "#b99b6b" : "transparent",
                color: variant === v ? "#1c130c" : "#f5ead6",
                cursor: "pointer",
              }}
            >
              ({v})
            </button>
          ))}
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {doc && (
          <PDFViewer key={`${page}-${variant}`} width="100%" height="100%" style={{ border: "none" }} showToolbar>
            {doc}
          </PDFViewer>
        )}
      </div>
    </main>
  );
}
