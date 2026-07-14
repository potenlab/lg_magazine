// REALISTIC full-session load test for the LG Magazine LLM endpoint.
//
// Unlike loadtest-llm-600.js (which fires the single lightest task in a tight
// loop), here each VU walks ONE real user session end-to-end: the actual ordered
// sequence of ~22 LLM tasks a participant triggers across the 4-chapter flow —
// light judges/reflections, the 3 heavy synthesis calls, the 4 chapter articles,
// and the cover/editor notes — with think-time between steps.
//
//   POST https://mybook.lgacademy.com/api/v3/llm   (auth: minted qrius_session)
//
// Each VU runs exactly ONE session (one iteration). VUS = concurrent sessions.
// A short arrival ramp spreads session starts (real users don't all start at once).
//
// Run a single safe baseline trace:
//   VUS=1 k6 run scripts/loadtest-llm-realistic.js
// Run a bounded concurrent cohort:
//   VUS=20 ARRIVAL=60s k6 run scripts/loadtest-llm-realistic.js
//
// Env: BASE_URL, VUS (concurrent sessions), ARRIVAL (ramp seconds), THINK (s between steps, default 2)

import http from "k6/http";
import { check } from "k6";
import { sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://mybook.lgacademy.com";
const VUS = parseInt(__ENV.VUS || "1", 10);
const ARRIVAL = __ENV.ARRIVAL || "5s";
const THINK = parseFloat(__ENV.THINK || "2");

const COOKIES = new SharedArray("cookies", () => JSON.parse(open("../loadtest/cookies.json")));

// ── realistic sample payloads (Korean), one per task ─────────────────────────
const NAME = "민준";
const STORY_A = "팀원들이 막막해할 때 제가 흐름을 정리해서 다음 단계를 제시했을 때 가장 몰입했어요.";
const STORY_B = "처음 해보는 문제를 며칠씩 파고들며 구조를 짓는 과정에서 시간 가는 줄 몰랐습니다.";
const VALUES = [
  { word: "성장", meaning: "어제보다 나아지는 감각" },
  { word: "연결", meaning: "사람과 아이디어를 잇는 일" },
  { word: "몰입", meaning: "한 가지에 깊이 빠지는 시간" },
];
const TOOLS_NOW = ["기획", "글쓰기", "데이터분석"];
const TOOLS_GROW = ["AI활용", "퍼실리테이션"];

// Complete V3Session fixture (mirrors EMPTY_V3_SESSION shape, fully populated) —
// writeChapterArticle/writeCoverHeadline/writeEditorNote read ~20 session.* fields,
// incl. valueDefinitions[topValue] and identityName (must be real strings).
const SESSION = {
  sessionId: "realistic", name: NAME, gender: "그", job: "프로덕트 매니저",
  freeContext: "이직을 고민 중", awkwardnessFeedback: "",
  flowExperience1: STORY_A, flowExperience2: STORY_B,
  ch1PoeticMirror: "흩어진 것을 잇고 구조를 짓는",
  commonPattern: "흩어진 것을 잇고 구조를 짓는",
  selectedValues: ["성장", "연결", "몰입"],
  valueDefinitions: { 성장: "어제보다 나아지는 감각", 연결: "사람과 아이디어를 잇는 일", 몰입: "한 가지에 깊이 빠지는 시간" },
  topValue: "연결", valueReflection: "스스로 방향을 잡고 사람들과 함께 나아갈 때 힘이 나는 사람",
  helpRequests: "막막할 때 정리 좀 해줘", strengthCommonAsk: "아직 형태가 없는 것을 다듬는 일",
  strengthLinkedValue: "연결", strengthConfirmed: true, strengthRevised: "", selfStrengthAlignment: "new",
  strengthSynthesis: "구조를 지어 흩어진 사람과 생각을 잇는 힘", growthVisionSynthesis: "",
  othersDescription: "차분하게 길을 보여주는 사람",
  patternMirrorSituation: "", patternMirrorBehavior: "", patternConfirmed: true, patternRevised: "",
  identityName: "잇는 사람",
  futureSelf: "사람과 아이디어를 잇는 일을 더 깊이 하는 모습", futureDay: "",
  visionLine: "흩어진 것을 잇고 구조를 지어 길을 보여주는 사람", timeHorizon: [],
  attraction: "사람들의 막막함이 풀리는 순간", alreadyDoing: "작은 회고 모임 운영",
  obstacles: "시간 부족", whyReason: "그 순간의 보람이 크기 때문",
  growthDirection: "전문성 연결", currentTool: TOOLS_NOW, growthTool: TOOLS_GROW,
  contribution: "막막한 사람들에게 길을 보여주는 것",
  growthDirectionRecommendations: [], jobTrendCards: [],
  firstStep: "매주 한 명과 회고 대화", supportPerson: "이전 팀 동료", neededResource: "꾸준한 시간",
  closingFeedback: "", followupCounts: {}, chapterArticles: {}, lastSceneId: "intro",
  startedAt: "", schemaVersion: 2,
};

const P = {
  judgeBranch: { rule: "flow", answer: STORY_A },
  reflectShort: { answer: STORY_A, name: NAME, chapter: 1, topic: "몰입경험" },
  comfortReassure: { answer: "조금 어색해요", name: NAME },
  extractKeyword: { answer: STORY_A, rule: "common" },
  reflectPoetic: { name: NAME, storyA: STORY_A, storyB: STORY_B },
  rephraseLight: { answer: "성장은 어제보다 나아지는 것", name: NAME },
  reflectValues: { name: NAME, values: VALUES },
  reflectStrength: { name: NAME, helpRequests: "정리 좀 해줘", values: ["성장", "연결", "몰입"] },
  synthesizeStrength: {
    name: NAME, flowExperience1: STORY_A, flowExperience2: STORY_B,
    commonPattern: "흩어진 것을 잇고 구조를 짓는", selectedValues: VALUES,
    strengthCommonAsk: "정리와 방향 제시", helpRequests: "막막할 때 정리 요청",
    othersDescription: "차분하게 길을 보여주는 사람",
  },
  synthesizeGrowthVision: {
    name: NAME, gender: "그", job: "프로덕트 매니저",
    flowExperience1: STORY_A, flowExperience2: STORY_B, selectedValues: VALUES,
    topValue: "연결", identityName: "잇는 사람", strengthSynthesis: "구조를 지어 사람을 잇는 힘",
    othersDescription: "차분한 정리자", attraction: "막막함이 풀리는 순간",
    alreadyDoing: "작은 회고 모임", obstacles: "시간 부족", whyReason: "보람이 커서",
    growthDirection: "전문성 연결", currentTool: TOOLS_NOW, growthTool: TOOLS_GROW,
    contribution: "길을 보여주는 것",
  },
  generateVisionDirections: {
    name: NAME, job: "프로덕트 매니저", commonPattern: "흩어진 것을 잇는",
    identityName: "잇는 사람", strengthSummary: "구조를 지어 사람을 잇는 힘",
    attraction: "막막함이 풀리는 순간", alreadyDoing: "회고 모임",
    whyReason: "보람이 커서", growthDirection: "전문성 연결",
    currentTool: TOOLS_NOW, growthTool: TOOLS_GROW, contribution: "길을 보여주는 것",
  },
  writeChapterArticle1: { name: NAME, gender: "그", job: "프로덕트 매니저", chapter: 1, session: SESSION },
  writeChapterArticle2: { name: NAME, gender: "그", job: "프로덕트 매니저", chapter: 2, session: SESSION },
  writeChapterArticle3: { name: NAME, gender: "그", job: "프로덕트 매니저", chapter: 3, session: SESSION },
  writeChapterArticle4: { name: NAME, gender: "그", job: "프로덕트 매니저", chapter: 4, session: SESSION },
  writeCoverHeadline: { session: SESSION },
  writeEditorNoteIntro: { session: SESSION, kind: "intro" },
  writeEditorNoteOutro: { session: SESSION, kind: "outro" },
};

// Ordered sequence of one real session: [task, weight] where task maps to a P[] key.
// weight is for reporting only ("heavy" = synthesis-class).
const SEQUENCE = [
  ["judgeBranch", "light"],
  ["reflectShort", "light"],
  ["judgeBranch", "light"],
  ["reflectShort", "light"],
  ["extractKeyword", "light"],
  ["reflectPoetic", "light"],
  ["rephraseLight", "light"],
  ["rephraseLight", "light"],
  ["rephraseLight", "light"],
  ["reflectValues", "light"],
  ["reflectStrength", "light"],
  ["synthesizeStrength", "heavy"],        // Ch2 magazine
  ["synthesizeGrowthVision", "heavy"],    // Ch3 magazine
  ["generateVisionDirections", "heavy"],  // Ch3 directions
  ["writeChapterArticle1", "heavy"],
  ["writeChapterArticle2", "heavy"],
  ["writeChapterArticle3", "heavy"],
  ["writeChapterArticle4", "heavy"],
  ["writeCoverHeadline", "light"],
  ["writeEditorNoteIntro", "light"],
  ["writeEditorNoteOutro", "light"],
];

// task key -> real endpoint task name (strip chapter suffix / note kind)
function taskName(key) {
  if (key.startsWith("writeChapterArticle")) return "writeChapterArticle";
  if (key.startsWith("writeEditorNote")) return "writeEditorNote";
  return key;
}

const latByTask = new Trend("task_latency", true);
const okByTask = new Rate("task_success");
const heavyLat = new Trend("heavy_latency", true);
const lightLat = new Trend("light_latency", true);
const sessionDur = new Trend("session_duration_ms", true);
const sessionOk = new Rate("session_complete"); // session where ALL calls returned 200
const upstream500 = new Counter("upstream_500");

const ARRIVAL_S = parseFloat(String(ARRIVAL).replace("s", "")) || 5;

export const options = {
  scenarios: {
    realistic_sessions: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,        // each VU runs exactly ONE full session
      maxDuration: "20m",
    },
  },
  thresholds: {
    "session_complete": ["rate>=0"],
    "task_success": ["rate>=0"],
  },
  discardResponseBodies: false,
};

export default function () {
  // Spread session starts across ARRIVAL seconds (real users don't all start at once).
  if (VUS > 1) sleep((ARRIVAL_S * (__VU - 1)) / VUS);

  const cookie = COOKIES[__VU % COOKIES.length];
  const headers = { "Content-Type": "application/json", Cookie: `qrius_session=${cookie}` };

  const sStart = Date.now();
  let allOk = true;

  for (const [key, weight] of SEQUENCE) {
    const name = taskName(key);
    const body = JSON.stringify({ task: name, payload: P[key], sessionId: `realistic-${__VU}` });
    const res = http.post(`${BASE_URL}/api/v3/llm`, body, {
      headers, timeout: "65s", tags: { task: name, weight },
    });
    const ok = res.status === 200;
    latByTask.add(res.timings.duration, { task: name });
    okByTask.add(ok, { task: name });
    (weight === "heavy" ? heavyLat : lightLat).add(res.timings.duration);
    if (!ok) {
      allOk = false;
      const b = typeof res.body === "string" ? res.body : "";
      if (b.includes("aistudio call") || b.includes("오류가 발생")) upstream500.add(1, { task: name });
    }
    check(res, { "200": (r) => r.status === 200 }, { task: name });

    // think-time between steps (real users read/type; compressed for the test)
    sleep(THINK + Math.random() * THINK);
  }

  sessionDur.add(Date.now() - sStart);
  sessionOk.add(allOk);
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (n, s) => (m[n] && m[n].values[s] !== undefined ? m[n].values[s] : null);
  const out = {
    base_url: BASE_URL,
    concurrent_sessions: VUS,
    tasks_per_session: SEQUENCE.length,
    heavy_calls_per_session: SEQUENCE.filter(([, w]) => w === "heavy").length,
    sessions_started: v("iterations", "count"),
    session_complete_rate: v("session_complete", "rate"),
    session_duration_med_ms: v("session_duration_ms", "med"),
    session_duration_p95_ms: v("session_duration_ms", "p(95)"),
    task_success_rate: v("task_success", "rate"),
    heavy_latency_med_ms: v("heavy_latency", "med"),
    heavy_latency_p95_ms: v("heavy_latency", "p(95)"),
    light_latency_med_ms: v("light_latency", "med"),
    light_latency_p95_ms: v("light_latency", "p(95)"),
    total_requests: v("http_reqs", "count"),
    upstream_500: v("upstream_500", "count") || 0,
  };
  return {
    "docs/loadtest-llm-realistic-results.json": JSON.stringify(out, null, 2),
    "loadtest/summary-llm-realistic-raw.json": JSON.stringify(data, null, 2),
    stdout: "\n" + JSON.stringify(out, null, 2) + "\n",
  };
}
