// Adapts a stored V3 session into the admin page's conversation-thread shape.
// The admin UI was built for the v2 BrandingData schema; v3 has a completely
// different field set, so rather than force a lossy field-to-field mapping we
// give v3 its own thread builder that the admin detail view dispatches to.

import type { V3Session } from "@/lib/v3/scenes/types";

export type ConversationEntry = {
  label: string;
  text?: string;
  tone?: "question" | "answer" | "followup" | "result";
  /** 기록 패널에서 인라인 편집을 허용할 답변의 V3Session 필드 키.
   *  배열·파생·뱃치 필드는 비워둘 것 — 클라이언트는 fieldKey 가 있고 tone 이
   *  "answer" 일 때만 "수정" 어피던스를 렌더한다. */
  fieldKey?: keyof V3Session & string;
};

export type ChapterThread = {
  chapter: string;
  title: string;
  entries: ConversationEntry[];
};

function fmtValueDefs(defs: Record<string, string> | undefined): string {
  if (!defs) return "";
  const entries = Object.entries(defs).filter(([, v]) => v && v.trim());
  return entries.map(([k, v]) => `· ${k}: ${v}`).join("\n");
}

function fmtAlignment(v: string): string {
  if (v === "known") return "이미 알고 있었어요";
  if (v === "new") return "새롭게 보였어요";
  if (v === "mixed") return "반반이에요";
  return "";
}

// strengthSynthesis 원본은 `[HEADLINE: 제목] 본문\n[HEADLINE: …] …` 4-BEAT 한 줄 구조 +
// **bold** 및 따옴표가 섞여 있다. 모달은 "AI 같다"는 피드백을 받아 다음 형태로 정리한다:
//   ~BEAT 주제~         ← ChapterReviewOverlay가 ~…~를 작은 이탤릭으로 렌더링
//   [제목]
//   본문
// 각 BEAT 사이 빈 줄 한 줄. HEADLINE 접두/볼드/따옴표 기호 모두 제거.
const STRENGTH_BEAT_TOPICS = ["두 장면을 잇는 것", "공통의 결", "타인의 시선", "가치의 뿌리"];
function fmtStrengthSynthesis(raw: string | undefined): string {
  if (!raw) return "";
  const stripMarks = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/[""""''‘’`]/g, "").trim();
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, i) => {
      const topic = STRENGTH_BEAT_TOPICS[i] ?? "";
      const topicLine = topic ? `~${topic}~\n` : "";
      const m = line.match(/^\[HEADLINE:\s*([^\]]+)\]\s*(.*)$/);
      if (!m) return `${topicLine}${stripMarks(line)}`;
      const headline = stripMarks(m[1]);
      const body = stripMarks(m[2]);
      return `${topicLine}[${headline}]\n${body}`;
    })
    .join("\n\n");
}

/** Build the per-chapter conversation threads for a v3 session, mirroring the
 * v2 buildChapterThreads shape so the admin detail view can render either.
 * Accepts a raw V3Session (not a V3SessionRecord wrapper) so both
 * stored-record consumers and live-session consumers can call it. */
export function buildV3ChapterThreads(s: V3Session): ChapterThread[] {
  const articles = s.chapterArticles ?? {};
  const articleEntry = (n: 1 | 2 | 3 | 4): ConversationEntry[] => {
    const a = articles[n];
    if (!a) return [];
    return [
      {
        label: `AI 기사: ${a.headline}`,
        tone: "result",
        text: [a.body, a.pullQuote ? `— ${a.pullQuote}` : ""].filter(Boolean).join("\n\n"),
      },
    ];
  };

  return [
    {
      chapter: "Chapter 0",
      title: "VISION EXPRESS 탑승을 환영합니다",
      entries: [
        { label: "질문", tone: "question", text: "열차에 오르기 전, 지금 마음이 어떤지 궁금해요." },
        { label: "나의 답변", tone: "answer", text: s.freeContext, fieldKey: "freeContext" },
        { label: "어색함 / 긴장 피드백", tone: "answer", text: s.awkwardnessFeedback, fieldKey: "awkwardnessFeedback" },
      ],
    },
    {
      chapter: "Chapter 1",
      title: "내가 지나온 길",
      entries: [
        { label: "질문", tone: "question", text: "시간 가는 줄 모르고 빠져들었던 순간은?" },
        { label: "첫 번째 경험", tone: "answer", text: s.flowExperience1, fieldKey: "flowExperience1" },
        { label: "질문", tone: "question", text: "비슷하게 빠져들었던 또 다른 순간은?" },
        { label: "두 번째 경험", tone: "answer", text: s.flowExperience2, fieldKey: "flowExperience2" },
        { label: "엘아울의 한마디", tone: "result", text: s.ch1PoeticMirror },
        { label: "질문", tone: "question", text: "그 안에 흐르는 공통점이 있다면, 어떤 것이 있을까요?" },
        { label: "내가 찾은 공통점", tone: "answer", text: s.commonPattern, fieldKey: "commonPattern" },
        ...articleEntry(1),
      ],
    },
    {
      chapter: "Chapter 2",
      title: "나는 누구인가",
      entries: [
        { label: "선택한 가치 카드", tone: "answer", text: s.selectedValues?.join(", ") },
        { label: "각 가치의 의미", tone: "answer", text: fmtValueDefs(s.valueDefinitions) },
        { label: "엘아울의 한마디", tone: "result", text: s.valueReflection },
        { label: "도움 요청받았던 경험", tone: "answer", text: s.helpRequests, fieldKey: "helpRequests" },
        { label: "AI: 강점 공통 결", tone: "result", text: s.strengthCommonAsk },
        { label: "타인이 보는 나", tone: "answer", text: s.othersDescription, fieldKey: "othersDescription" },
        { label: "엘아울의 발견", tone: "result", text: fmtStrengthSynthesis(s.strengthSynthesis) },
        { label: "자기 강점 정렬", tone: "answer", text: fmtAlignment(s.selfStrengthAlignment) },
        { label: "AI: 패턴 미러 (상황)", tone: "result", text: s.patternMirrorSituation },
        { label: "AI: 패턴 미러 (행동)", tone: "result", text: s.patternMirrorBehavior },
        {
          label: "패턴 확인",
          tone: "answer",
          text: s.patternConfirmed ? "맞아요" : s.patternRevised,
        },
        { label: "나의 정체성", tone: "answer", text: s.identityName, fieldKey: "identityName" },
        ...articleEntry(2),
      ],
    },
    {
      chapter: "Chapter 3",
      title: "내가 그리는 미래",
      entries: [
        { label: "끌리는 것", tone: "answer", text: s.attraction, fieldKey: "attraction" },
        { label: "이미 하고 있는 것", tone: "answer", text: s.alreadyDoing, fieldKey: "alreadyDoing" },
        { label: "걸리는 것 / 장애물", tone: "answer", text: s.obstacles, fieldKey: "obstacles" },
        { label: "향하고 싶은 이유", tone: "answer", text: s.whyReason, fieldKey: "whyReason" },
        { label: "성장 방향", tone: "answer", text: s.growthDirection, fieldKey: "growthDirection" },
        { label: "지금 잘 쓰는 도구", tone: "answer", text: s.currentTool?.join(", ") },
        { label: "더 키우고 싶은 도구", tone: "answer", text: s.growthTool?.join(", ") },
        { label: "기여하고 싶은 것", tone: "answer", text: s.contribution, fieldKey: "contribution" },
        { label: "나의 성장 비전 문장", tone: "result", text: s.visionLine },
        { label: "시간 지평 (1년/3년/언젠가)", tone: "answer", text: s.timeHorizon?.join("\n") },
        ...articleEntry(3),
      ],
    },
    {
      chapter: "Chapter 4",
      title: "내일로 향하는 한 걸음",
      entries: [
        { label: "질문", tone: "question", text: "내일부터 시작할 수 있는 가장 작은 한 걸음은?" },
        { label: "내일부터의 첫 걸음", tone: "answer", text: s.firstStep, fieldKey: "firstStep" },
        { label: "함께할 사람", tone: "answer", text: s.supportPerson, fieldKey: "supportPerson" },
        { label: "필요한 자원", tone: "answer", text: s.neededResource, fieldKey: "neededResource" },
      ],
    },
  ];
}
