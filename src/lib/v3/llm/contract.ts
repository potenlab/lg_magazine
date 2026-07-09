import type { V3Session, Branch } from "@/lib/v3/scenes/types";

export interface JudgeBranchInput {
  sceneId: string;
  answer: string;
  context?: Partial<V3Session>;
}
export interface JudgeBranchResult {
  branch: Branch;
  reason: string;
}

export interface LLMContract {
  judgeBranch(input: JudgeBranchInput): Promise<JudgeBranchResult>;

  /** `topic` is the followup's parentSaveTo (e.g. "supportPerson",
   * "neededResource", "firstStep") — disambiguates which question the
   * answer responds to. Chapter alone isn't enough: Ch4 asks three
   * different things and a chapter-only style guide mis-reads a
   * "누구와 함께" answer as a "행동" answer. */
  reflectShort(input: {
    answer: string;
    name: string;
    chapter?: 1 | 2 | 3 | 4;
    topic?: string;
  }): Promise<string>;

  /** Lightly rephrase a participant's answer for inline display — preserves
   * meaning ~90% but smooths colloquial filler and tunes opener/closer so the
   * line reads as L-OWL gently re-voicing the participant. */
  rephraseLight(input: { answer: string; name: string }): Promise<string>;

  /** Acknowledge a participant's awkwardness/discomfort and reassure them in L-OWL voice. */
  comfortReassure(input: { answer: string; name: string }): Promise<string>;

  reflectPoetic(input: {
    name: string;
    storyA: string;
    storyB: string;
  }): Promise<string>;

  /** Weave all selected values + their personal definitions into one
   * sentence reflecting back the participant's value pattern (e.g.
   * "스스로 방향을 잡고, 믿을 수 있는 사람들과 함께, 매일 조금씩 나아지는
   * 방식으로 일할 때 가장 힘이 나는 사람이시군요."). */
  reflectValues(input: {
    name: string;
    values: { word: string; meaning: string }[];
  }): Promise<string>;

  /** From the helpRequests answer + selected values, extract:
   * - commonAsk: a phrase summarizing what others commonly brought to the
   *   user (e.g. "아직 형태가 없는 것을 다듬는 일")
   * - linkedValue: which of the user's selected values this most maps to
   * Used by 2-7 to surface external evidence of strength. */
  reflectStrength(input: {
    name: string;
    helpRequests: string;
    values: { word: string; meaning: string }[];
  }): Promise<{ commonAsk: string; linkedValue: string }>;

  /** [22p] Editor synthesis — weave four ingredients (Ch1 flow common, Ch2
   * selected values, Ch2 strength common-ask pattern, Ch2 othersDescription)
   * into 3~4 sentences of editor analysis that mirror the participant's
   * strength portrait back at them. Returns the joined sentences as one
   * string for downstream display. */
  synthesizeStrength(input: {
    name: string;
    flowExperience1: string;
    flowExperience2: string;
    commonPattern: string;
    selectedValues: { word: string; meaning: string }[];
    strengthCommonAsk: string;
    helpRequests: string;
    othersDescription: string;
    // `fromStub: true` 일 때는 호출자가 결과를 세션에 캐싱하지 말 것
    // — stub fallback(API 실패·timeout·빈 출력)이 한 번 떴다고 그 일반
    // 템플릿을 영구 저장해버리면 사용자가 재진입해도 LLM 재호출이 안 되어
    // 무한히 stub만 보게 됨. 실제 LLM 응답일 때만 캐시.
  }): Promise<{ synthesis: string; fromStub?: boolean }>;

  /** [ch3 wow] Editor growth-vision synthesis — pulls all of ch1/ch2/ch3
   * material together (flow moments, value definitions, identity name,
   * strength synthesis, attraction, obstacles, growth direction, tools,
   * contribution, etc.) and weaves a longer magazine-style summary (~1000자
   * total, 4~6 beat cards). Each beat is one short paragraph; beats are
   * joined by `\n` so the downstream scene can split them into cards. */
  synthesizeGrowthVision(input: {
    name: string;
    gender: "그" | "그녀";
    job: string;
    flowExperience1: string;
    flowExperience2: string;
    selectedValues: { word: string; meaning: string }[];
    topValue: string;
    identityName: string;
    strengthSynthesis: string;
    othersDescription: string;
    attraction: string;
    alreadyDoing: string;
    obstacles: string;
    whyReason: string;
    growthDirection: string;
    currentTool: string[];
    growthTool: string[];
    contribution: string;
  }): Promise<{ synthesis: string; fromStub?: boolean }>;

  /** From the Ch3 vision inputs plus Ch1/Ch2 carry-over, generate 6 future-
   * direction sentences along distinct axes (role / method / strength /
   * growth / impact / integration). Returns the 6 sentence texts in that
   * fixed order. */
  generateVisionDirections(input: {
    name: string;
    job: string;
    commonPattern: string;
    identityName: string;
    strengthSummary: string;
    attraction: string;
    alreadyDoing: string;
    whyReason: string;
    growthDirection: string;
    currentTool: string[];
    growthTool: string[];
    contribution: string;
  }): Promise<{ directions: string[]; fromStub?: boolean }>;

  /** [ch3 wireframe Zone B — 2026-06-15] Job-category-driven trend cards.
   * Generates 3 outside-the-self trend observations rooted in the participant's
   * job category — "역할이 어떻게 재정의되고 있는지" / "어떤 일이 새로 주목
   * 받는지" 같은 바깥 시선. Each card has a direction sentence ("~하는 사람",
   * 30자 내외) and a context sentence (20자 내외, 왜 이 방향이 주목받는지).
   * Renders below the 6-axis recommendation grid as 🦉 "El Owl's Outside View"
   * section in GrowthVisionSynthesisScene. */
  generateJobTrendCards(input: {
    job: string;
  }): Promise<{ cards: { direction: string; context: string }[]; fromStub?: boolean }>;

  /** From the participant's finalized growth-direction line (visionLine) plus
   * carry-over context, generate 3 time-horizon sentences: "1년 안에 …" /
   * "3년 후에 …" / "언젠가 …". Used by scene 3-10b ([18p]) to pre-fill three
   * editable inputs. */
  generateTimeHorizon(input: {
    name: string;
    job: string;
    visionLine: string;
    attraction: string;
    contribution: string;
  }): Promise<{ horizon: string[]; fromStub?: boolean }>;

  extractKeyword(input: {
    answer: string;
    rule: "flow" | "common" | "future";
  }): Promise<string>;

  observePattern(input: {
    name: string;
    storyA: string;
    storyB: string;
    selectedValue: string;
    valueDef: string;
  }): Promise<{ situationPattern: string; behaviorPattern: string }>;

  writeChapterArticle(input: {
    name: string;
    gender: "그" | "그녀";
    job: string;
    chapter: 1 | 2 | 3 | 4;
    session: V3Session;
  }): Promise<{
    headline: string;
    body: string;
    pullQuote: string | null;
  }>;

  writeEditorNote(input: {
    session: V3Session;
    kind: "intro" | "outro";
  }): Promise<string>;

  writeCoverHeadline(input: { session: V3Session }): Promise<string>;
}
