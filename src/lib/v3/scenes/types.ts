// src/lib/v3/scenes/types.ts

export type Chapter = 0 | 1 | 2 | 3 | 4 | "C";

export type OwlPose =
  | "serious"
  | "writing"
  | "laughing"
  | "thinking"
  | "handing"
  | "listening"
  | "offering"
  | "contemplating"
  | "closingBook"
  | "welcoming"
  | "scrutinizing"
  | "explaining"
  | "approving"
  | "curious"
  | "focusedWriting"
  | "noteHanding"
  | "sideGlance";

/** Pool of "general interview" poses that can be rotated freely without
 * disrupting the cinematic narrative. Excludes contemplating / closingBook /
 * welcoming / scrutinizing / handing — those are reserved for specific story
 * beats. `handing` (book held up to present) reads as a "handoff/closing"
 * gesture and is reserved for explicit handoff scenes (Ch1 1-1, closing).
 *
 * `laughing` is reserved for closing-only joy (C-3) — not appropriate when
 * the editor is receiving a serious or contemplative answer.
 * `offering` is reserved for moments where the editor explicitly extends
 * something (a hint, a card, the next step) — not a generic interview pose. */
export const INTERVIEW_OWL_POOL: OwlPose[] = [
  "writing",
  "focusedWriting",
  "thinking",
  "curious",
  "listening",
  "sideGlance",
];

export type TimeOfDay =
  | "preBoard"
  | "sunset"
  | "dusk"
  | "starsRising"
  | "starsFull"
  | "midnight"
  | "dawnPink"
  | "dawnFirstLight";

export type Branch = "A" | "B" | "C" | "D";

export type SceneKind =
  | "intro"
  | "chapterCard"
  | "owlNarration"
  | "ritual"
  | "binaryChoice"
  | "owlReflect"
  | "question"
  | "followup"
  | "valueQuestion"
  | "valueCards"
  | "valueDef"
  | "valueDefSingle"
  | "valueRank"
  | "patternConfirm"
  | "ch1Keyword"
  | "valueReflection"
  | "strengthConfirm"
  | "strengthSynthesis"
  | "growthVisionSynthesis"
  | "cardChoice"
  | "toolSelect"
  | "visionSelect"
  | "timeHorizon"
  | "recordPage"
  | "ambience"
  | "magazineHandoff"
  | "magazinePoster"
  | "editorCredits";

export type SceneId = string;

export interface BranchSpec {
  lines?: string[];
  /** Pool of opener variants — one is picked at random per scene mount and
   * prepended before `lines`. Used to vary the empathic acknowledgment so
   * back-to-back follow-ups don't repeat the same line. */
  openerPool?: string[];
  narration?: string;
  inputHint?: string;
  placeholder?: string;
  next?: SceneId;
  /** Exit-only — alternate lines shown when the user is force-advanced after
   * exhausting maxFollowups instead of reaching this exit naturally. Per spec
   * 14.5: 소진 시에도 추켜세우지 않고 담담하게 받아주는 톤. Falls back to `lines`. */
  exhaustedLines?: string[];
}

export interface SceneSpec {
  id: SceneId;
  chapter: Chapter;
  kind: SceneKind;
  owl?: OwlPose;
  /** Optional pool of poses to randomly pick from on scene mount — use to
   * vary the editor's posture across consecutive interview moments so the
   * visual doesn't feel locked. Falls back to `owl` if not set. */
  owlPool?: OwlPose[];
  timeOfDay?: TimeOfDay;
  /** Override the time-of-day background with a specific image (e.g. window-only view). */
  bgImage?: string;
  /** Override the time-of-day background with a solid color. Used for image-free cinematic beats. */
  bgColor?: string;
  /** Hide the owl entirely for this scene (e.g. dedicated landscape moments). */
  hideOwl?: boolean;
  /** Lift the owl up toward mid-screen (e.g. owl reveal / introduction). */
  owlLift?: boolean;
  /** Render the owl at a larger size (used together with owlLift for hero introductions). */
  owlLarge?: boolean;
  /** Override the speaker label above the dialog. Defaults to "편집장 | 엘 아울". */
  speakerLabel?: string;
  /** Suppress the speaker label entirely (used for the pre-introduction scenes). */
  hideSpeakerLabel?: boolean;
  /** Widen the dialog and reduce its min-height (more landscape-shaped). */
  dialogWide?: boolean;
  /**
   * Cinematic ambience: opens with NO dialog (background only, click anywhere
   * to advance), then reveals narration in a semi-transparent (~55%) parchment.
   * Only honored by `ambience` kind. Without this flag, ambience scenes render
   * normally with the standard parchment dialog. */
  cinematic?: boolean;

  lines?: string[];
  /** Override the default page size for paginated narration. Use `1` to make
   * each line land on its own beat — handy for long mirror lines that contain
   * full user-input quotes (e.g. value-def / pattern recap scenes). */
  pageSize?: number;
  narration?: string;
  inputHint?: string;
  /** Editor's aside — a meta-comment from L-OWL about how to respond
   * (e.g. "꼭 회사에서 있었던 일이 아니라도 괜찮아요"). Renders as a small
   * italic callout between prompt lines and the input field. Distinct from
   * `inputHint` (textarea placeholder) — this is editor-to-user guidance. */
  editorNote?: string;
  /** When set, a "내 답변 다시 보기" toggle button appears above the input,
   * revealing a panel that lists the user's saved answers from earlier scenes.
   * Use to let the user re-read their own prior responses while answering a
   * synthesis question. field can be a V3Session key or synthetic resolver key. */
  reviewFields?: { label: string; field: string }[];
  placeholder?: string;
  buttonLabel?: string;
  saveTo?: keyof V3Session;

  judge?: "judgeBranch";
  branches?: Partial<Record<Branch, BranchSpec>>;
  maxFollowups?: number;

  /** For kind=binaryChoice / cardChoice — options, each with its own destination.
   * Optional `set` patches the session when a choice is made.
   * `description` shows a sub-label beneath the main label (cardChoice only). */
  choices?: { label: string; description?: string; next: SceneId; set?: Partial<V3Session> }[];

  /** For kind=owlReflect — which LLM task to call. */
  reflectTask?: "comfortReassure";
  /** For kind=owlReflect — which V3Session field holds the user's input to feed the LLM. */
  reflectInputField?: keyof V3Session;

  /** Used by kind=followup to know which V3Session field to overwrite on retry. */
  parentSaveTo?: keyof V3Session;

  /** Optional alternate destination — used by kind=valueQuestion to route the
   * "open value cards" link to the cards scene while `next` is the freetext
   * submit destination. */
  altNext?: SceneId;

  /** Background music/sound for this scene. Path relative to /public. */
  bgm?: string;

  next?: SceneId | ((session: V3Session) => SceneId);
}

export interface V3Session {
  /** Stable identifier for this participant's run — generated on first save,
   * persisted in localStorage, and used as the upsert key for server-side
   * sync (admin can list all sessions by it). */
  sessionId: string;
  name: string;
  gender: "그" | "그녀";
  job: string;
  freeContext: string;
  awkwardnessFeedback: string;

  flowExperience1: string;
  flowExperience2: string;
  ch1PoeticMirror: string;

  commonPattern: string;
  selectedValues: string[];
  valueDefinitions: Record<string, string>;
  topValue: string;
  /** LLM-generated reflection that weaves all selected values + their meanings
   * into one sentence (e.g. "스스로 방향을 잡고, 믿을 수 있는 사람들과 함께,
   * 매일 조금씩 나아지는 방식으로 일할 때 가장 힘이 나는 사람이시군요."). Used
   * by 2-5b to mirror the user's value set back without forcing a single pick. */
  valueReflection: string;
  /** User-reported moments when others came to them for help — surfaces
   * external evidence of strengths and trust signals. Asked at 2-6 after
   * the value reflection. */
  helpRequests: string;
  /** LLM extraction from helpRequests — the common "form" of what others
   * brought to the user (e.g. "아직 형태가 없는 것을 다듬는 일"). */
  strengthCommonAsk: string;
  /** LLM pick — which of the user's selectedValues most aligns with the
   * common ask pattern, used to phrase the strength reflection. */
  strengthLinkedValue: string;
  /** User's confirmation of the strength reflection (맞아요 / 조금 달라요). */
  strengthConfirmed: boolean;
  /** User's free-text revision when they rejected the strength reflection. */
  strengthRevised: string;
  /** How the user feels the strength reflection aligns with their self-view
   * — "known" (이미 알고 있었어요) / "new" (새롭게 보였어요) / "mixed" (반반이에요). */
  selfStrengthAlignment: "known" | "new" | "mixed" | "";
  /** [22p] LLM-generated 3~4 sentence editor synthesis woven from four
   * ingredients: Ch1 flow common pattern, Ch2 main values, Ch2 strength
   * common-ask pattern, and Ch2 othersDescription. Cached on the session so
   * the [22p] beat is stable on resume. */
  strengthSynthesis: string;
  /** ch3 growth-vision LLM synthesis — long magazine-style summary (5 beats,
   * ~1000자) covering ch1/ch2/ch3 material. Cached so the wow beat is stable
   * on resume. */
  growthVisionSynthesis: string;
  /** User's answer to "what would someone close to you say about you?" —
   * the final synthesis question before naming themselves at 2-8. */
  othersDescription: string;
  patternMirrorSituation: string;
  patternMirrorBehavior: string;
  patternConfirmed: boolean;
  patternRevised: string;
  identityName: string;

  futureSelf: string;
  futureDay: string;
  visionLine: string;
  /** [3-10b] Three time-horizon sentences (1년 안에 / 3년 후에 / 언젠가),
   * LLM-seeded from visionLine then edited by the participant. */
  timeHorizon: string[];

  /** Ch3 v3 fields — vision flow */
  /** [3-1] What the participant is drawn toward doing/becoming */
  attraction: string;
  /** [3-2] What they're already doing in that direction, even in small ways */
  alreadyDoing: string;
  /** [3-3] Obstacles / friction points on that path */
  obstacles: string;
  /** [3-4] The real reason they want to go in that direction despite obstacles */
  whyReason: string;
  /** [3-6] Expertise combination approach: 전문성 심화 / 전문성 확장 / 전문성 연결 */
  growthDirection: string;
  /** [3-7] Tools the participant uses best now (max 2 labels from toolOptions). */
  currentTool: string[];
  /** [3-7] Tools the participant wants to grow into (max 2 labels from toolOptions). */
  growthTool: string[];
  /** [3-8] The kind of contribution/impact they want to have in the world */
  contribution: string;

  firstStep: string;
  supportPerson: string;
  neededResource: string;

  followupCounts: Record<string, number>;
  /** Cached LLM-generated chapter articles. Filled when a recordPage scene
   * is first viewed; reused later by MagazineHandoffScene so the PDF shows
   * the same text the participant saw in the chapter record page. */
  chapterArticles: Record<number, { headline: string; body: string; pullQuote: string | null }>;
  lastSceneId: SceneId;
  startedAt: string;
  schemaVersion: 2;
}

export const EMPTY_V3_SESSION: V3Session = {
  sessionId: "",
  name: "",
  gender: "그",
  job: "",
  freeContext: "",
  awkwardnessFeedback: "",
  flowExperience1: "",
  flowExperience2: "",
  ch1PoeticMirror: "",
  commonPattern: "",
  selectedValues: [],
  valueDefinitions: {},
  topValue: "",
  valueReflection: "",
  helpRequests: "",
  strengthCommonAsk: "",
  strengthLinkedValue: "",
  strengthConfirmed: false,
  strengthRevised: "",
  selfStrengthAlignment: "",
  strengthSynthesis: "",
  growthVisionSynthesis: "",
  othersDescription: "",
  patternMirrorSituation: "",
  patternMirrorBehavior: "",
  patternConfirmed: false,
  patternRevised: "",
  identityName: "",
  futureSelf: "",
  futureDay: "",
  visionLine: "",
  timeHorizon: [],
  attraction: "",
  alreadyDoing: "",
  obstacles: "",
  whyReason: "",
  growthDirection: "",
  currentTool: [],
  growthTool: [],
  contribution: "",
  firstStep: "",
  supportPerson: "",
  neededResource: "",
  followupCounts: {},
  chapterArticles: {},
  lastSceneId: "intro",
  startedAt: "",
  schemaVersion: 2,
};
