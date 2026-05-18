// Adapts a stored V3 session into the admin page's conversation-thread shape.
// The admin UI was built for the v2 BrandingData schema; v3 has a completely
// different field set, so rather than force a lossy field-to-field mapping we
// give v3 its own thread builder that the admin detail view dispatches to.

import type { V3Session } from "@/lib/v3/scenes/types";

export type ConversationEntry = {
  label: string;
  text?: string;
  tone?: "question" | "answer" | "followup" | "result";
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
        { label: "질문", tone: "question", text: "이 열차에 오르기 전, 마음에 남아 있는 것이 있나요?" },
        { label: "참가자 답변", tone: "answer", text: s.freeContext },
        { label: "어색함 / 긴장 피드백", tone: "answer", text: s.awkwardnessFeedback },
      ],
    },
    {
      chapter: "Chapter 1",
      title: "내가 지나온 길",
      entries: [
        { label: "질문", tone: "question", text: "시간 가는 줄 모르고 빠져들었던 순간은?" },
        { label: "첫 번째 경험", tone: "answer", text: s.flowExperience1 },
        { label: "질문", tone: "question", text: "비슷하게 빠져들었던 또 다른 순간은?" },
        { label: "두 번째 경험", tone: "answer", text: s.flowExperience2 },
        { label: "AI: 시적 미러", tone: "result", text: s.ch1PoeticMirror },
        ...articleEntry(1),
      ],
    },
    {
      chapter: "Chapter 2",
      title: "나는 누구인가",
      entries: [
        { label: "선택한 가치 카드", tone: "answer", text: s.selectedValues?.join(", ") },
        { label: "각 가치의 의미", tone: "answer", text: fmtValueDefs(s.valueDefinitions) },
        { label: "가장 소중한 가치", tone: "answer", text: s.topValue },
        { label: "AI: 가치 reflection", tone: "result", text: s.valueReflection },
        { label: "도움 요청받았던 경험", tone: "answer", text: s.helpRequests },
        { label: "AI: 강점 공통 결", tone: "result", text: s.strengthCommonAsk },
        { label: "타인이 보는 나", tone: "answer", text: s.othersDescription },
        { label: "AI: 강점 종합 (4재료)", tone: "result", text: s.strengthSynthesis },
        { label: "자기 강점 정렬", tone: "answer", text: fmtAlignment(s.selfStrengthAlignment) },
        { label: "AI: 패턴 미러 (상황)", tone: "result", text: s.patternMirrorSituation },
        { label: "AI: 패턴 미러 (행동)", tone: "result", text: s.patternMirrorBehavior },
        {
          label: "패턴 확인",
          tone: "answer",
          text: s.patternConfirmed ? "맞아요" : s.patternRevised,
        },
        { label: "나의 정체성", tone: "answer", text: s.identityName },
        ...articleEntry(2),
      ],
    },
    {
      chapter: "Chapter 3",
      title: "내가 그리는 미래",
      entries: [
        { label: "끌리는 것", tone: "answer", text: s.attraction },
        { label: "이미 하고 있는 것", tone: "answer", text: s.alreadyDoing },
        { label: "걸리는 것 / 장애물", tone: "answer", text: s.obstacles },
        { label: "향하고 싶은 이유", tone: "answer", text: s.whyReason },
        { label: "성장 방향", tone: "answer", text: s.growthDirection },
        { label: "지금 잘 쓰는 도구", tone: "answer", text: s.currentTool?.join(", ") },
        { label: "더 키우고 싶은 도구", tone: "answer", text: s.growthTool?.join(", ") },
        { label: "기여하고 싶은 것", tone: "answer", text: s.contribution },
        { label: "AI + 참가자 확정: 비전 문장", tone: "result", text: s.visionLine },
        { label: "시간 지평 (1년/3년/언젠가)", tone: "answer", text: s.timeHorizon?.join("\n") },
        ...articleEntry(3),
      ],
    },
    {
      chapter: "Chapter 4",
      title: "내일로 향하는 한 걸음",
      entries: [
        { label: "질문", tone: "question", text: "내일부터 시작할 수 있는 가장 작은 한 걸음은?" },
        { label: "내일부터의 첫 걸음", tone: "answer", text: s.firstStep },
        { label: "함께할 사람", tone: "answer", text: s.supportPerson },
        { label: "필요한 자원", tone: "answer", text: s.neededResource },
        ...articleEntry(4),
      ],
    },
  ];
}
