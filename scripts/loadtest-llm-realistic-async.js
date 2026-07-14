// ASYNC-aware REALISTIC full-session load test for the LG Magazine LLM endpoint.
//
// Production now runs the async job queue: POST /api/v3/llm returns 202 + { jobId }
// and the client polls GET /api/v3/llm/jobs?id=... until done. This script walks
// ONE real user session end-to-end — the ordered ~21 LLM tasks across the 4-chapter
// flow (light judges/reflections, 3 heavy synthesis calls, 4 heavy chapter
// articles, cover/editor notes) — enqueueing each task then polling to completion
// before moving to the next, exactly like the real client. We measure EVENTUAL
// per-task success and time-to-result (enqueue + queue wait + processing).
//
//   POST https://mybook.lgacademy.com/api/v3/llm   (auth: minted qrius_session)
//   GET  https://mybook.lgacademy.com/api/v3/llm/jobs?id=<jobId>
//
// Each VU runs exactly ONE session. VUS = concurrent sessions.
//
//   VUS=600 ARRIVAL=600 k6 run scripts/loadtest-llm-realistic-async.js
//
// Env: BASE_URL, VUS (concurrent sessions), ARRIVAL (ramp seconds, default 60),
//      THINK (s between steps, default 2), POLL (s between polls, default 2),
//      DEADLINE (s to wait per task before giving up, default 300),
//      TAG (suffix for the output filenames, default "600")
//
// Each VU picks a random persona so prompts differ across users.

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "https://mybook.lgacademy.com";
const VUS = parseInt(__ENV.VUS || "1", 10);
const ARRIVAL_S = parseFloat(__ENV.ARRIVAL || "60");
const THINK = parseFloat(__ENV.THINK || "2");
const POLL_S = parseFloat(__ENV.POLL || "2");
const DEADLINE_S = parseFloat(__ENV.DEADLINE || "300"); // per-task wait cap

const COOKIES = new SharedArray("cookies", () => JSON.parse(open("../loadtest/cookies.json")));

// ── personas (Korean): each VU picks one at random so prompts differ ─────────
const PERSONAS = [
  {
    name: "민준", gender: "그", job: "프로덕트 매니저",
    storyA: "팀원들이 막막해할 때 제가 흐름을 정리해서 다음 단계를 제시했을 때 가장 몰입했어요.",
    storyB: "처음 해보는 문제를 며칠씩 파고들며 구조를 짓는 과정에서 시간 가는 줄 몰랐습니다.",
    values: [
      { word: "성장", meaning: "어제보다 나아지는 감각" },
      { word: "연결", meaning: "사람과 아이디어를 잇는 일" },
      { word: "몰입", meaning: "한 가지에 깊이 빠지는 시간" },
    ],
    pattern: "흩어진 것을 잇고 구조를 짓는", identity: "잇는 사람",
    vision: "흩어진 것을 잇고 구조를 지어 길을 보여주는 사람",
    attraction: "사람들의 막막함이 풀리는 순간",
    contribution: "막막한 사람들에게 길을 보여주는 것",
    others: "차분하게 길을 보여주는 사람",
    toolsNow: ["기획", "글쓰기", "데이터분석"], toolsGrow: ["AI활용", "퍼실리테이션"],
  },
  {
    name: "서연", gender: "그녀", job: "UX 디자이너",
    storyA: "사용자 인터뷰에서 아무도 말하지 않던 불편을 발견하고 화면 흐름을 처음부터 다시 그렸을 때 가장 몰입했어요.",
    storyB: "복잡한 기능을 버튼 하나로 줄이는 방법을 찾느라 밤새 프로토타입을 만졌던 시간이 기억에 남아요.",
    values: [
      { word: "공감", meaning: "상대의 입장에서 먼저 느껴보는 것" },
      { word: "탐구", meaning: "왜라고 한 번 더 묻는 습관" },
      { word: "단순함", meaning: "복잡한 것을 덜어내는 용기" },
    ],
    pattern: "숨은 불편을 찾아내 단순하게 풀어내는", identity: "덜어내는 사람",
    vision: "복잡함 속에서 본질만 남겨 보여주는 디자이너",
    attraction: "사용자가 헤매지 않고 웃는 순간",
    contribution: "누구나 쉽게 쓰는 경험을 만드는 것",
    others: "조용히 핵심을 짚어주는 사람",
    toolsNow: ["Figma", "사용자리서치"], toolsGrow: ["AI프로토타이핑", "데이터분석"],
  },
  {
    name: "지훈", gender: "그", job: "백엔드 개발자",
    storyA: "새벽까지 장애 로그를 추적해서 아무도 못 찾던 근본 원인을 잡아냈을 때 가장 몰입했습니다.",
    storyB: "느린 쿼리를 하나씩 뜯어고쳐 응답 시간을 10분의 1로 줄이는 과정이 게임처럼 재미있었어요.",
    values: [
      { word: "집요함", meaning: "끝까지 파고드는 힘" },
      { word: "신뢰", meaning: "맡긴 일은 반드시 되게 하는 것" },
      { word: "단순함", meaning: "덜 복잡한 구조가 더 강하다는 믿음" },
    ],
    pattern: "끝까지 파고들어 근본 원인을 찾는", identity: "파고드는 사람",
    vision: "복잡한 시스템을 단단하게 지탱하는 엔지니어",
    attraction: "원인을 찾아내 문제가 사라지는 순간",
    contribution: "동료들이 믿고 기댈 수 있는 시스템을 만드는 것",
    others: "묵묵하지만 끝을 보는 사람",
    toolsNow: ["Node.js", "SQL"], toolsGrow: ["아키텍처설계", "AI코딩도구"],
  },
  {
    name: "하은", gender: "그녀", job: "마케터",
    storyA: "고객 후기 수백 개를 읽고 뽑아낸 한 문장이 캠페인 반응을 두 배로 만들었을 때 짜릿했어요.",
    storyB: "작은 브랜드의 이야기를 세상에 알리는 콘텐츠를 기획하며 시간 가는 줄 몰랐습니다.",
    values: [
      { word: "창의", meaning: "낯선 것을 연결해 새것을 만드는 일" },
      { word: "공감", meaning: "고객의 마음을 먼저 읽는 것" },
      { word: "속도", meaning: "생각을 빠르게 실험으로 옮기는 힘" },
    ],
    pattern: "사람의 마음을 읽어 말로 옮기는", identity: "옮기는 사람",
    vision: "브랜드와 사람 사이에 다리를 놓는 마케터",
    attraction: "메시지가 사람들의 마음에 닿는 순간",
    contribution: "좋은 것을 필요한 사람에게 알리는 것",
    others: "감각 있고 빠른 사람",
    toolsNow: ["콘텐츠기획", "SNS운영"], toolsGrow: ["데이터마케팅", "AI콘텐츠"],
  },
  {
    name: "도윤", gender: "그", job: "데이터 분석가",
    storyA: "흩어진 지표들 사이에서 아무도 못 본 패턴을 찾아 회사의 결정을 바꿨을 때 가장 몰입했습니다.",
    storyB: "지저분한 데이터를 정리해 하나의 대시보드로 만드는 과정이 퍼즐처럼 즐거웠어요.",
    values: [
      { word: "정확함", meaning: "숫자 앞에서 정직한 것" },
      { word: "호기심", meaning: "데이터 뒤의 이야기를 궁금해하는 것" },
      { word: "영향력", meaning: "분석이 실제 변화로 이어지는 것" },
    ],
    pattern: "숫자 속에서 이야기를 찾아내는", identity: "읽어내는 사람",
    vision: "데이터로 더 나은 결정을 이끄는 분석가",
    attraction: "숫자가 설득이 되는 순간",
    contribution: "감이 아닌 근거로 결정하게 돕는 것",
    others: "꼼꼼하고 믿을 수 있는 사람",
    toolsNow: ["SQL", "Python"], toolsGrow: ["머신러닝", "스토리텔링"],
  },
  {
    name: "수아", gender: "그녀", job: "HR 매니저",
    storyA: "갈등하던 두 팀 사이에서 대화 자리를 만들어 협업이 다시 살아났을 때 큰 보람을 느꼈어요.",
    storyB: "신입사원들이 온보딩 과정을 거치며 성장하는 모습을 지켜보는 일에 시간 가는 줄 몰랐습니다.",
    values: [
      { word: "경청", meaning: "판단 없이 끝까지 듣는 것" },
      { word: "성장", meaning: "사람의 변화를 믿는 것" },
      { word: "조화", meaning: "서로 다른 사람들이 어울리게 하는 것" },
    ],
    pattern: "사람 사이의 온도를 맞추는", identity: "품는 사람",
    vision: "사람이 성장하는 조직을 만드는 HR",
    attraction: "사람들이 서로를 이해하게 되는 순간",
    contribution: "일하기 좋은 팀 문화를 만드는 것",
    others: "따뜻하지만 중심이 있는 사람",
    toolsNow: ["면접", "조직문화"], toolsGrow: ["코칭", "피플애널리틱스"],
  },
  {
    name: "예준", gender: "그", job: "영업 매니저",
    storyA: "고객이 말하지 않은 진짜 고민을 듣고 제안서를 처음부터 다시 써서 계약을 따냈을 때 가장 몰입했습니다.",
    storyB: "거절당한 고객을 반년 동안 다시 찾아가 신뢰를 쌓아가는 과정이 오히려 즐거웠어요.",
    values: [
      { word: "진정성", meaning: "팔기 전에 먼저 돕는 것" },
      { word: "도전", meaning: "거절을 배움으로 바꾸는 것" },
      { word: "관계", meaning: "한 번의 거래보다 긴 인연" },
    ],
    pattern: "진심으로 듣고 신뢰를 쌓는", identity: "쌓는 사람",
    vision: "고객의 문제를 먼저 해결하는 파트너",
    attraction: "고객이 먼저 나를 찾는 순간",
    contribution: "믿고 맡길 수 있는 사람이 되는 것",
    others: "진심이 느껴지는 사람",
    toolsNow: ["제안서작성", "협상"], toolsGrow: ["산업분석", "AI영업도구"],
  },
  {
    name: "지우", gender: "그녀", job: "콘텐츠 에디터",
    storyA: "복잡하게 얽힌 이야기를 독자가 단숨에 이해하는 한 문장으로 정리했을 때 가장 몰입했어요.",
    storyB: "인터뷰이의 진심이 드러나는 질문을 고민하며 며칠을 보내는 시간이 좋았습니다.",
    values: [
      { word: "명료함", meaning: "어려운 것을 쉽게 만드는 것" },
      { word: "공감", meaning: "쓰는 사람보다 읽는 사람을 생각하는 것" },
      { word: "꾸준함", meaning: "매일 조금씩 쌓아가는 힘" },
    ],
    pattern: "얽힌 이야기를 풀어 전하는", identity: "풀어내는 사람",
    vision: "읽는 사람의 시간을 아껴주는 에디터",
    attraction: "독자가 단번에 이해했다고 말하는 순간",
    contribution: "좋은 이야기가 제대로 전해지게 하는 것",
    others: "정확하고 다정한 사람",
    toolsNow: ["글쓰기", "인터뷰"], toolsGrow: ["영상편집", "AI글쓰기도구"],
  },
];

// Complete V3Session fixture (mirrors EMPTY_V3_SESSION shape) from a persona.
function makeSession(p) {
  return {
    sessionId: "realistic", name: p.name, gender: p.gender, job: p.job,
    freeContext: "요즘 커리어 방향을 고민 중", awkwardnessFeedback: "",
    flowExperience1: p.storyA, flowExperience2: p.storyB,
    ch1PoeticMirror: p.pattern, commonPattern: p.pattern,
    selectedValues: p.values.map((v) => v.word),
    valueDefinitions: p.values.reduce((o, v) => { o[v.word] = v.meaning; return o; }, {}),
    topValue: p.values[1].word, valueReflection: p.values[1].meaning + "에서 힘을 얻는 사람",
    helpRequests: "막막할 때 정리 좀 해줘", strengthCommonAsk: "아직 형태가 없는 것을 다듬는 일",
    strengthLinkedValue: p.values[1].word, strengthConfirmed: true, strengthRevised: "", selfStrengthAlignment: "new",
    strengthSynthesis: p.pattern + " 힘", growthVisionSynthesis: "",
    othersDescription: p.others,
    patternMirrorSituation: "", patternMirrorBehavior: "", patternConfirmed: true, patternRevised: "",
    identityName: p.identity,
    futureSelf: p.contribution + "을 더 깊이 하는 모습", futureDay: "",
    visionLine: p.vision, timeHorizon: [],
    attraction: p.attraction, alreadyDoing: "작은 스터디 모임 운영",
    obstacles: "시간 부족", whyReason: "그 순간의 보람이 크기 때문",
    growthDirection: "전문성 연결", currentTool: p.toolsNow, growthTool: p.toolsGrow,
    contribution: p.contribution,
    growthDirectionRecommendations: [], jobTrendCards: [],
    firstStep: "매주 한 번 실천 기록", supportPerson: "이전 팀 동료", neededResource: "꾸준한 시간",
    closingFeedback: "", followupCounts: {}, chapterArticles: {}, lastSceneId: "intro",
    startedAt: "", schemaVersion: 2,
  };
}

function makeP(p) {
  const SESSION = makeSession(p);
  return {
    // judgeBranch contract: local HEAD wants { sceneId }, the deployed build wants
    // { rule: "ch1FlowAnswer" }. Send both keys so the test works on either build.
    judgeBranch: { sceneId: "1-2", rule: "ch1FlowAnswer", answer: p.storyA },
    judgeBranch2: { sceneId: "1-4", rule: "ch1FlowAnswer", answer: p.storyB },
    reflectShort: { answer: p.storyA, name: p.name, chapter: 1, topic: "몰입경험" },
    comfortReassure: { answer: "조금 어색해요", name: p.name },
    extractKeyword: { answer: p.storyA, rule: "common" },
    reflectPoetic: { name: p.name, storyA: p.storyA, storyB: p.storyB },
    rephraseLight: { answer: p.values[0].word + "은 " + p.values[0].meaning, name: p.name },
    reflectValues: { name: p.name, values: p.values },
    reflectStrength: { name: p.name, helpRequests: "정리 좀 해줘", values: p.values },
    observePattern: {
      name: p.name, storyA: p.storyA, storyB: p.storyB,
      selectedValue: SESSION.topValue, valueDef: p.values[1].meaning,
    },
    generateTimeHorizon: {
      name: p.name, job: p.job, visionLine: p.vision,
      attraction: p.attraction, contribution: p.contribution,
    },
    synthesizeStrength: {
      name: p.name, flowExperience1: p.storyA, flowExperience2: p.storyB,
      commonPattern: p.pattern, selectedValues: p.values,
      strengthCommonAsk: SESSION.strengthCommonAsk, helpRequests: SESSION.helpRequests,
      othersDescription: p.others,
    },
    synthesizeGrowthVision: {
      name: p.name, gender: p.gender, job: p.job,
      flowExperience1: p.storyA, flowExperience2: p.storyB, selectedValues: p.values,
      topValue: SESSION.topValue, identityName: p.identity, strengthSynthesis: SESSION.strengthSynthesis,
      othersDescription: p.others, attraction: p.attraction,
      alreadyDoing: SESSION.alreadyDoing, obstacles: SESSION.obstacles, whyReason: SESSION.whyReason,
      growthDirection: SESSION.growthDirection, currentTool: p.toolsNow, growthTool: p.toolsGrow,
      contribution: p.contribution,
    },
    generateVisionDirections: {
      name: p.name, job: p.job, commonPattern: p.pattern,
      identityName: p.identity, strengthSummary: SESSION.strengthSynthesis,
      attraction: p.attraction, alreadyDoing: SESSION.alreadyDoing,
      whyReason: SESSION.whyReason, growthDirection: SESSION.growthDirection,
      currentTool: p.toolsNow, growthTool: p.toolsGrow, contribution: p.contribution,
    },
    writeChapterArticle1: { name: p.name, gender: p.gender, job: p.job, chapter: 1, session: SESSION },
    writeChapterArticle2: { name: p.name, gender: p.gender, job: p.job, chapter: 2, session: SESSION },
    writeChapterArticle3: { name: p.name, gender: p.gender, job: p.job, chapter: 3, session: SESSION },
    writeChapterArticle4: { name: p.name, gender: p.gender, job: p.job, chapter: 4, session: SESSION },
    writeCoverHeadline: { session: SESSION },
    writeEditorNoteIntro: { session: SESSION, kind: "intro" },
    writeEditorNoteOutro: { session: SESSION, kind: "outro" },
  };
}

// Ordered sequence of one real session: [task key, weight].
// Weight mirrors the server's tier routing (route.ts LIGHT_TASKS): cover/editor
// notes and generateTimeHorizon ride the HEAVY lane.
const SEQUENCE = [
  ["judgeBranch", "light"],
  ["reflectShort", "light"],
  ["judgeBranch2", "light"],
  ["reflectShort", "light"],
  ["extractKeyword", "light"],
  ["reflectPoetic", "light"],
  ["rephraseLight", "light"],
  ["rephraseLight", "light"],
  ["rephraseLight", "light"],
  ["reflectValues", "light"],
  ["reflectStrength", "light"],
  ["observePattern", "light"],            // Ch2 pattern confirm (added 2026-06)
  ["synthesizeStrength", "heavy"],        // Ch2 magazine
  ["synthesizeGrowthVision", "heavy"],    // Ch3 magazine
  ["generateVisionDirections", "heavy"],  // Ch3 directions
  ["generateTimeHorizon", "heavy"],       // Ch3 time horizon (added 2026-06, heavy lane)
  ["writeChapterArticle1", "heavy"],
  ["writeChapterArticle2", "heavy"],
  ["writeChapterArticle3", "heavy"],
  ["writeChapterArticle4", "heavy"],
  ["writeCoverHeadline", "heavy"],
  ["writeEditorNoteIntro", "heavy"],
  ["writeEditorNoteOutro", "heavy"],
];

function taskName(key) {
  if (key.startsWith("writeChapterArticle")) return "writeChapterArticle";
  if (key.startsWith("writeEditorNote")) return "writeEditorNote";
  if (key === "judgeBranch2") return "judgeBranch";
  return key;
}

// The server NEVER returns stub content — stubs are generated client-side in
// realLLM.ts when callTask() throws (non-202 enqueue, job "error", 404, timeout).
// So at the API layer "user would see a stub" = those hard failures (counted for
// ALL tasks via markFallback) PLUS done-jobs whose result is degenerate — BUT only
// for tasks whose CLIENT actually converts a degenerate result into a stub. The 6
// tasks below have such a guard (realLLM empty→stub, or scene length checks). Other
// tasks (reflectShort/rephraseLight/writeEditorNote/writeCoverHeadline/judgeBranch/
// reflectStrength/observePattern/writeChapterArticle) show blank/stuck/patched-empty
// on degenerate output — a different failure mode, not a stub — so we do NOT count
// their degenerate results here (their hard failures still count via markFallback).
function isDegenerate(task, result) {
  switch (task) {
    case "reflectPoetic":
    case "reflectValues":
      return !String(result ?? "").trim();        // realLLM !r?.trim() → stub
    case "synthesizeStrength":
    case "synthesizeGrowthVision":
      return !result?.synthesis?.trim();           // realLLM !synthesis.trim() → stub
    case "generateVisionDirections":
      return !Array.isArray(result?.directions) || result.directions.length < 6;  // VisionSelectScene >=6
    case "generateTimeHorizon":
      return !Array.isArray(result?.horizon) || result.horizon.length < 3;          // TimeHorizonScene >=3
    default:
      return false;
  }
}

const latByTask = new Trend("task_ttr", true);     // per-task time-to-result
const okByTask = new Rate("task_success");          // task reached done w/ result
const heavyTtr = new Trend("heavy_ttr", true);
const lightTtr = new Trend("light_ttr", true);
const sessionDur = new Trend("session_duration_ms", true);
const sessionOk = new Rate("session_complete");     // ALL tasks in session succeeded
const enqMs = new Trend("enqueue_ms", true);
const poll404 = new Counter("poll_404");
const upstreamErr = new Counter("upstream_error");
const clientTimeout = new Counter("client_timeout");
// "Fallback" = a real client would show a generic stub for this task: hard
// failure (non-202/error/404/timeout) OR a done-job with a degenerate result.
const fallbackByTask = new Rate("task_fallback");
const fallbackTotal = new Counter("fallback_total");

// Distinct task names (after taskName() collapsing) — used to declare per-task
// threshold submetrics so the end-of-run summary breaks failures down per step.
const TASK_NAMES = [...new Set(SEQUENCE.map(([k]) => taskName(k)))];

const perTaskThresholds = {};
for (const t of TASK_NAMES) {
  perTaskThresholds[`task_success{task:${t}}`] = ["rate>=0"];
  perTaskThresholds[`task_fallback{task:${t}}`] = ["rate>=0"];
}

export const options = {
  scenarios: {
    realistic_sessions: {
      executor: "per-vu-iterations",
      vus: VUS,
      iterations: 1,
      maxDuration: __ENV.MAXDUR || "150m",
    },
  },
  thresholds: {
    "session_complete": ["rate>=0"],
    "task_success": ["rate>=0"],
    ...perTaskThresholds,
  },
  discardResponseBodies: false,
};

// Enqueue one task and poll to completion. Returns true on eventual success.
function runTask(key, P, headers, getHeaders, vu) {
  const name = taskName(key);
  const body = JSON.stringify({ task: name, payload: P[key], sessionId: `realistic-${vu}` });
  const markFallback = () => { fallbackByTask.add(true, { task: name }); fallbackTotal.add(1); };

  const t0 = Date.now();
  const post = http.post(`${BASE_URL}/api/v3/llm`, body, {
    headers, timeout: "30s", tags: { task: name, step: "enqueue" },
  });
  enqMs.add(Date.now() - t0);

  if (post.status !== 202) {
    okByTask.add(false, { task: name });
    markFallback(); // non-202 enqueue → client callTask throws → stub
    return false;
  }
  let jobId;
  try { jobId = post.json("jobId"); } catch (e) { jobId = null; }
  if (!jobId) { okByTask.add(false, { task: name }); markFallback(); return false; }

  for (;;) {
    sleep(POLL_S);
    const r = http.get(`${BASE_URL}/api/v3/llm/jobs?id=${jobId}`, {
      headers: getHeaders, timeout: "30s", tags: { task: name, step: "poll" },
    });
    if (r.status === 404) { poll404.add(1); okByTask.add(false, { task: name }); markFallback(); return false; }
    if (r.status === 200) {
      let status;
      try { status = r.json("status"); } catch (e) { status = null; }
      if (status === "done") {
        const ttr = Date.now() - t0;
        latByTask.add(ttr, { task: name });
        okByTask.add(true, { task: name });
        // Done but degenerate → the client's !trim()/length guards turn this
        // into a stub. Real (non-degenerate) results record a non-fallback.
        let result;
        try { result = r.json("result"); } catch (e) { result = null; }
        const degenerate = isDegenerate(name, result);
        fallbackByTask.add(degenerate, { task: name });
        if (degenerate) fallbackTotal.add(1);
        return true;
      }
      if (status === "error") { upstreamErr.add(1); okByTask.add(false, { task: name }); markFallback(); return false; }
    }
    if (Date.now() - t0 > DEADLINE_S * 1000) {
      clientTimeout.add(1); okByTask.add(false, { task: name }); markFallback(); return false;
    }
  }
}

export default function () {
  // Spread session starts across ARRIVAL seconds.
  if (VUS > 1) sleep((ARRIVAL_S * (__VU - 1)) / VUS);

  const cookie = COOKIES[__VU % COOKIES.length];
  const headers = { "Content-Type": "application/json", Cookie: `qrius_session=${cookie}` };
  const getHeaders = { Cookie: `qrius_session=${cookie}` };

  // Random persona per VU → every user prompts differently.
  const P = makeP(PERSONAS[Math.floor(Math.random() * PERSONAS.length)]);

  const sStart = Date.now();
  let allOk = true;

  for (const [key, weight] of SEQUENCE) {
    const t0 = Date.now();
    const ok = runTask(key, P, headers, getHeaders, __VU);
    (weight === "heavy" ? heavyTtr : lightTtr).add(Date.now() - t0);
    check(null, { ok: () => ok }, { task: taskName(key) });
    if (!ok) allOk = false;
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
    arrival_window_s: ARRIVAL_S,
    tasks_per_session: SEQUENCE.length,
    heavy_calls_per_session: SEQUENCE.filter(([, w]) => w === "heavy").length,
    sessions_started: v("iterations", "count"),
    session_complete_rate: v("session_complete", "rate"),
    session_duration_med_ms: v("session_duration_ms", "med"),
    session_duration_p95_ms: v("session_duration_ms", "p(95)"),
    task_success_rate: v("task_success", "rate"),
    heavy_ttr_med_ms: v("heavy_ttr", "med"),
    heavy_ttr_p95_ms: v("heavy_ttr", "p(95)"),
    light_ttr_med_ms: v("light_ttr", "med"),
    light_ttr_p95_ms: v("light_ttr", "p(95)"),
    enqueue_ms_p95: v("enqueue_ms", "p(95)"),
    total_requests: v("http_reqs", "count"),
    poll_404: v("poll_404", "count") || 0,
    upstream_error: v("upstream_error", "count") || 0,
    client_timeout: v("client_timeout", "count") || 0,
    fallback_total: v("fallback_total", "count") || 0,
    fallback_rate: v("task_fallback", "rate"),
    // Per-step breakdown: calls, hard failures (never reached "done"), and
    // fallbacks (hard fail OR degenerate result → user would see stub text).
    per_task: Object.fromEntries(
      TASK_NAMES.map((t) => [
        t,
        {
          calls:
            (v(`task_success{task:${t}}`, "passes") || 0) +
            (v(`task_success{task:${t}}`, "fails") || 0),
          hard_fails: v(`task_success{task:${t}}`, "fails") || 0,
          fallbacks: v(`task_fallback{task:${t}}`, "passes") || 0,
        },
      ]),
    ),
  };
  const TAG = __ENV.TAG || "600";
  const files = { stdout: "\n" + JSON.stringify(out, null, 2) + "\n" };
  files[`docs/loadtest-llm-realistic-${TAG}-results.json`] = JSON.stringify(out, null, 2);
  files[`loadtest/summary-llm-realistic-${TAG}-raw.json`] = JSON.stringify(data, null, 2);
  return files;
}
