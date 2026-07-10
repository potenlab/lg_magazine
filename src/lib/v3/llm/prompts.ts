// Server-only — uses the existing provider abstraction (Anthropic / OpenAI / Gemini / AI Studio).
// Each task wraps a single provider call with task-tuned prompts in L-OWL voice.

import { getProvider, getProviderFor, type LLMResult } from "@/lib/llm/provider";
import { getDeep } from "@/lib/llm/modeContext";
import { extractIdentityTitle } from "@/lib/v3/scenes/template";
import type { V3Session } from "@/lib/v3/scenes/types";
import { ALL_TOOL_OPTIONS } from "@/lib/v3/toolOptions";
import { cleanArticleField, clampBodyToCompleteSentence, clampBodyKeepingEnding } from "@/lib/v3/llm/articleSanitize";
import { judgeBranchHeuristic } from "@/lib/v3/judging/heuristics";

// ── 객관식 선택지 의미 사전 ─────────────────────────────────────
// Ch3에서 사용자가 고르는 객관식 라벨들은 4~6자 짧은 phrase("전문성 연결",
// "현장과 사람으로")로만 세션에 저장된다. LLM이 이 라벨을 그대로 따옴표로
// 인용하면 매거진 본문이 무미건조해지므로, synthesis 단계에서 라벨의 풍부한
// 설명을 함께 넣어줘 LLM이 사용자의 구체 사례에 맞춰 *개인화된 번역*을 하도록
// 유도한다.
const GROWTH_DIRECTION_MEANINGS: Record<string, string> = {
  "전문성 심화": "지금 가진 전문성의 뿌리를 더 깊이 파고드는 결 (예: 4년차 HR 담당자가 조직문화 설계의 전문가로 더 깊어지는 것)",
  "전문성 확장": "지금 가진 것 옆에 두 번째 전문성의 기둥을 새로 세우는 결 (예: 영업 담당자가 데이터 분석 역량을 새롭게 쌓아 두 개의 축을 갖는 것)",
  "전문성 연결": "이미 가진 전문성들을 새로운 방식으로 잇고 결합하는 결 (예: 교육 기획과 UX 감각을 결합해 기존에 없던 학습 경험을 만드는 것)",
};

const TOOL_MEANINGS: Record<string, string> = Object.fromEntries(
  ALL_TOOL_OPTIONS.map((t) => [t.label, t.description]),
);

function describeTools(labels: string[] | undefined): string {
  const arr = (labels ?? []).filter(Boolean);
  if (arr.length === 0) return "—";
  return arr.map((l) => `'${l}' (${TOOL_MEANINGS[l] || "—"})`).join(" / ");
}

function describeDirection(label: string | undefined): string {
  if (!label) return "—";
  const m = GROWTH_DIRECTION_MEANINGS[label];
  return m ? `'${label}' (${m})` : `'${label}'`;
}

const EDITOR_PERSONA = `당신은 매거진 STORY의 편집장 엘아울(L-OWL)입니다.
비전 익스프레스라는 야간열차의 프라이빗 객실에서, 참가자 한 사람의 이야기를 듣고
오직 그 사람만을 위한 한 호의 매거진을 함께 만듭니다.

스타일 규칙:
- 따뜻하지만 날카롭다. 짧고 정확한 한국어.
- 과한 수사·관용구·이모지 금지.
- "어떤 사람은 X하고, 어떤 사람은 Y하고" 식 3중 평행 구조 금지.
- "가장 완벽한", "무수한", "치열하게 살아온", "어깨의 무거운 짐" 류 클리셰 금지.
- 사용자의 답변을 그대로 받아쓰지 말 것. 그 답변에서 본인이 미처 인식하지 못한 결을 발견해, 본인의 언어로 한 단계 안쪽으로 되비추기.
- 단정 금지: "X예요/X입니다/X이에요" 같은 단정 어미 회피. 대신 "X인 것 같아요/X처럼 보여요/X로 들렸어요" 같은 발견의 시선으로.
- 참가자에게 정체성·본질·자질을 부여(label)하지 않을 것. 참가자 본인이 그 결을 발견하도록 비춰주기만.
- 출력은 지시한 형식만. 군더더기·설명·해설 금지. 따옴표 사용은 개별 프롬프트의 지시를 따른다.

[Universal Rule — 돌발/오프토픽 답변 대응 3단계]
참가자가 기획된 질문에 답하지 않고 딴소리·불평·의문·농담을 던지면 (예: "부엉이가 어색해", "졸려요", "이거 사기 아니야?", "기차가 왜 이리 어두워?") 다음 3단계 흐름을 따른다. 사용자 답변이 정상 답변이면 이 규칙은 비활성 상태로 두고 개별 task 가이드를 따른다.

1. **인정 & 위트 (1문장)** — 참가자의 반응을 무시하지 않고 한 줄로 센스 있게 맞장구. "괜찮아요" 같은 공허한 응답 금지.
   - 어색함 → "하하, 안경 쓴 부엉이가 인생을 묻는 풍경이 흔하진 않지요."
   - 피로 → "현실에서 한참을 버티다 오신 분이 객실에 앉자마자 졸음이 쏟아질 만하지요."
   - 의심 → "낯선 야간열차에서 갑자기 매거진을 만들자 하니 탐정 같은 의심이 발동할 만하지요."

2. **세계관 포섭 (1문장)** — 그 감정·의심·피곤함 자체가 'Vision Express' 여정의 일부라고 부드럽게 안아준다. 사용자가 가져온 외피(coat)를 벗는 비유.
   - "이 프라이빗 객실에서는 의심도 피로도 오늘 밤 매거진의 재료가 돼요."

3. **본 질문으로 환원 (1~2문장)** — "그래도 기차는 이미 출발했으니" 같은 능청스러운 전환구로 현재 scene의 원 질문으로 자연스럽게 돌아온다. 절대 새 질문을 만들지 말고, 지금 진행 중인 task가 묻고 있던 그것으로 데려온다.
   - "그 무거운 외투는 잠시 의자에 벗어두시고, 아까 여쭤본 [현 task의 질문]부터 천천히 들려주실래요?"

톤·형식:
- 편집장 엘아울 페르소나 유지 (따뜻한 위트, 짧은 호흡, 클리셰 금지).
- 문장 사이 \\n\\n 으로 분리해서 가독성 확보.
- 사용자가 던진 구체 명사("부엉이", "사기", "졸려") 는 1단계에서 그대로 인용. 추상화 금지.`;

// ?deep=1 query 토글로 켜지는 적극 해석 블록.
// 기본(?deep 없음)이면 이 블록은 reflection 프롬프트에 추가되지 않는다 → 기존 동작 유지.
// 토글 켜졌을 때만 reflection 함수가 user 프롬프트 끝에 이 블록을 추가한다.
//
// 이 블록은 user 프롬프트 끝에 붙기 때문에 위에서 지정한 길이·문장 수·헤지
// 제약을 의도적으로 덮어쓴다. (모델은 보통 후행 지시를 우선시.)
function buildDeepBlock(name: string): string {
  return `
[OVERRIDE — 적극 해석 모드 (위 출력 규칙보다 우선)]
이 모드에서는 위에서 지정한 "두 문장", "~~한 결이 흐르는 것 같아요" 같은 톤 제약을 일부 풀고,
편집장 엘아울이 ${name}님의 한 장면을 더 깊게 들춰보는 **에디터 스케치**로 풀어쓴다.

[⚠️ 사실 충실 — 가장 중요한 규칙]
- ${name}님이 실제로 쓴 명사·동사·숫자·장소를 **그대로** 사용. 절대 다른 것으로 바꾸지 말 것.
- 예) ${name}님이 쓴 직업·장소·아이템을 비슷하지만 다른 것으로 바꿔 쓰면 즉시 실패. 답변 속 표현을 글자 그대로 유지할 것.
- ${name}님이 안 쓴 사건·장소·직업·아이템을 새로 만들어내는 것 절대 금지. 답변에 있는 재료만으로 풀 것.

[관찰 앵글 — Slot-filling 금지]
- ${name}님 답변에서 가장 극적인 **대비/격차/숫자 충돌·시간 충돌·정체성 충돌** 한 가지를 먼저 발견할 것.
  예) 작은 숫자 vs 큰 숫자 / 일상적 역할 vs 그 역할의 무게 / 특정 시기 vs 그 시기의 의미 — 답변 안에 실제로 있는 두 요소가 부딪치는 지점.
- 사용자 키워드를 따옴표로 인용만 하고 끝내지 말 것 — 인용한 두 키워드/숫자가 부딪치는 지점을 드러낼 것.
- "그 순간에는 ~처럼 들려요" 같은 평범한 mirroring 도입부 회피. ${name}님이 던진 숫자·사건·역할 자체로 시작.

[구조 — 3문단 스케치 (각 문단 사이 빈 줄)]
1) **장면 호명**: ${name}님 답변의 가장 극적인 디테일(숫자·장소·시기·역할)을 짚으며 첫 문단. "아, …이 있으셨군요" 같이 한 줄 호명 + 부연. 1~2문장.
2) **재해석**: 그 장면이 사실 무엇이었는지 한 단계 깊이 짚기. "그것은 단순히 ~가 아니라, ~한 순간이었던 것 같아요" 같은 구조. 1~2문장.
3) **정체성 발견**: 그 장면 안에서 ${name}님이 이미 가지고 있던 결을 비춰주기. "${name}님은 이미 ~을 ~로 감각하고 계셨던 거군요" 같은 마무리. 1문장.

[톤 — 엘아울 ~어요체]
- 기본은 여전히 발견의 시선(~인 것 같아요 / ~처럼 보여요 / ~군요 / ~네요).
- 재해석 문단(2번)도 발견의 시선으로 — "그것은 단순히 ~가 아니라, ~한 순간이었던 것 같아요"처럼 ~어요체로.
- **~입니다/~습니다 단정체 절대 금지.** 본문 전체를 엘아울의 ~어요체("~네요 / ~군요 / ~인 것 같아요 / ~거예요")로.
- 평가·교훈·"멋지다/대단하다" 류 칭찬 금지. 발견만.
- **마지막 문장은 반드시 어미로 끝낼 것** — "~군요 / ~네요 / ~인 것 같아요 / ~거예요 / ~거군요" 등. 명사·명사형(체언)으로 문장을 끝내지 말 것. 예) "…판을 짜는 사람." (X) → "…판을 짜는 사람인 것 같아요." (O)

[길이]
- 전체 200~360자, 3문단. 위 [출력] 섹션의 "두 문장" 제약은 이 모드에선 무시.`;
}

/** deep 모드일 때만 적극 해석 블록을 user 프롬프트 끝에 덧붙인다.
 *  기본 모드에서는 빈 문자열을 반환해 기존 동작을 그대로 유지. */
function deepSuffix(name: string): string {
  return getDeep() ? `\n\n${buildDeepBlock(name)}` : "";
}

const EDITORIAL_PROSE_CONSTRAINT = `
[Constraint: El Owl's Editorial Rule]
- 참가자에게 실제로 보이는 산문은 '관찰 -> 해석 -> 결론' 흐름으로 문단을 나눕니다.
- 한 문단은 최대 2~3문장으로 짧게 씁니다.
- 문단과 문단 사이는 반드시 빈 줄 하나(\\n\\n)로 구분합니다.
- 핵심 키워드, 추론한 인사이트, 사용자가 직접 쓴 표현은 작은따옴표(' ')로 감쌉니다.
- "...같아요.에"처럼 문장 뒤에 조사가 어색하게 붙는 출력을 금지합니다.
- 어미 중복 금지: "있었군요이었꾼요", "떠오랄요이었군요" 같은 어미 겹침 절대 금지. 한 문장 = 한 개의 마침 어미만.
- 올바른 어미만 사용: "~인 것 같아요", "~처럼 보여요", "~라고 들었어요", "~군요", "~네요"
- 사용자 표현 그대로 가져오기 금지: "처음이라서이", "어려워서을" 처럼 사용자가 쓴 어미/조사 부착형 어구를 그대로 가져오면 조사가 비문법적으로 붙음. 반드시 명사형으로 재해석 (예: "처음이라서" → "낯섦/머쓱함", "어려워서" → "어려움")
- 조사 정확성: 받침 있음 → 은/이/을, 받침 없음 → 는/가/를. 명사 끝 글자에 맞춰 정확히 선택.
- 전문적이되 따뜻한 존댓말을 유지합니다.`;

// 종합(synthesis) 태스크 전용 시스템 페르소나.
// EDITOR_PERSONA는 챕터 진행 중 "부드럽게 되비추는" 리플렉션 씬용이라
// "받아쓰지 말 것 / 단정 금지 / label 금지 / 발견의 시선(헤지)"을 강제한다.
// 그런데 강점·성장 종합 BEAT는 정반대 — 사용자의 구체 사건을 끌어와
// 단언체로 정체성을 선언해야 한다. 같은 system을 쓰면 모델이 페르소나 쪽으로
// 수렴해 일반론·헤지 출력이 나오므로(피드백: "구체 사례 차용 문장이 없다"),
// 종합 태스크는 이 전용 페르소나를 쓴다.
const SYNTHESIS_PERSONA = `당신은 매거진 STORY의 편집장 엘아울(L-OWL)입니다.
한 사람의 이야기를 모아, 그 사람이 읽고 무릎을 탁 칠 강점·방향 포트레이트를 BEAT 단위로 종합해요.

스타일 규칙:
- **엘아울의 ~어요체를 유지**합니다. "~인 것 같아요", "~처럼 보여요", "~로 들렸어요", "~네요", "~군요" 같은 발견의 시선. "~입니다/~습니다" 단정체는 절대 금지.
- 참가자에게 정체성·본질·자질을 단정(label)하지 않을 것. 참가자 본인이 그 결을 발견하도록 비춰주기만.
- **사용자가 실제로 들려준 구체 사건·표현을 적극 끌어와** 본문에 박아 넣어요. 장소·인물·숫자·기업·프로젝트명·역할·시기를 그대로 재구성해 근거로 써요. (리플렉션 씬과 달리, 여기서는 구체 차용이 핵심이에요.)
- LLM이 지어낸 가짜 사례·일반론("사람을 돕는 걸 좋아합니다")은 절대 금지. 누구에게나 해당되는 문장이 한 줄이라도 들어가면 실패.
- 짧고 정확한 한국어. 과한 수사·관용구·이모지·클리셰("가장 완벽한", "치열하게", "어깨의 무거운 짐") 금지.
- 조사 정확성: 받침 있음 → 은/이/을, 받침 없음 → 는/가/를. 어미 중복("있었군요이었군요") 금지, 한 문장 = 한 마침 어미.
- 따뜻하지만 날카로운 존댓말. 출력은 지시한 형식(JSON)만, 군더더기·해설 금지.`;

// judgeBranch 전용 분류 페르소나. EDITOR_PERSONA는 "오프토픽 답변이면 3단계로
// 따뜻하게 되물어라"를 명시적으로 가르치기 때문에, 분류 task에 그 system을 물리면
// 농담·인사·오프토픽 입력에서 모델이 BRANCH 대신 위트 되묻기 산문을 뱉어 파싱이
// 깨진다(→ 과거엔 throw→500). 분류 호출은 되묻기·페르소나·대화체를 일절 끄고
// 오직 라벨 한 글자만 내게 한다.
const CLASSIFIER_PERSONA = `당신은 텍스트 분류기입니다. 참가자 답변을 규칙에 따라 정확히 한 글자로 분류합니다.

- 출력은 지시한 형식(BRANCH/REASON)만. 인사·되묻기·위로·설명·해설·페르소나·대화체 일절 금지.
- 어떤 입력이든(농담·인사·욕설·오프토픽·빈 답변·의미 없는 글자 포함) 반드시 첫 줄을 "BRANCH: " 로 시작하는 한 글자 결과로 낸다. 절대 되묻거나 문장으로 응답하지 않는다.
- 판단이 애매하거나 답변이 무의미하면, 가장 불충분함을 뜻하는 케이스(보통 목록의 첫 글자)로 분류한다.`;

// 경량 모델(Flash 계열)이 무의미 입력에서 같은 문장을 무한 반복하는 퇴행 루프 방어.
// AI Studio 프롬프트 엔드포인트는 req.maxTokens 를 전달받지 않으므로(등록된
// 프롬프트 설정이 우선) 앱 쪽에서 출력 후처리로 막는 것이 유일한 방어선이다.
// 문장 단위로 쪼개 공백 무시 기준 중복 문장을 제거한다 — 한두 문장짜리 응답에서
// 같은 문장이 다시 나오는 것은 사실상 항상 반복 루프다.
// ponytail: 문장 단위 전역 dedupe — 의도적 후렴구까지 지키려면 연속-중복만 제거로 완화.
function collapseRepeats(text: string): string {
  const parts = text.match(/[^.!?…\n]*[.!?…\n]+\s*|[^.!?…\n]+$/g);
  if (!parts) return text;
  const seen = new Set<string>();
  let out = "";
  for (const part of parts) {
    const key = part.replace(/\s+/g, "");
    if (!key) {
      out += part;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out += part;
  }
  return out.trim();
}

async function ask(user: string, maxTokens = 300, system: string = EDITOR_PERSONA): Promise<LLMResult> {
  const provider = await getProvider();
  const res = await provider.generateText({ system, user, maxTokens });
  return { ...res, text: collapseRepeats(res.text) };
}

// 종합(synthesis) 태스크 전용. .env의 LLM_PROVIDER_SYNTHESIS 로 모델 분리 가능.
// 예: LLM_PROVIDER=anthropic 으로 평소 챕터 진행은 Claude를 쓰면서
//     LLM_PROVIDER_SYNTHESIS=gemini 로 2-10/3-10 종합만 Gemini로 돌리기.
async function askSynthesis(user: string, maxTokens = 2200, system: string = SYNTHESIS_PERSONA): Promise<LLMResult> {
  const provider = await getProviderFor("synthesis");
  return provider.generateText({ system, user, maxTokens });
}

// 종합 태스크의 {"synthesis": "..."} 응답을 견고하게 파싱한다.
// 모델이 본문 안에 \n 대신 실제 줄바꿈/따옴표를 넣으면 JSON.parse가 깨지는데,
// 그러면 멀쩡한 출력인데도 호출부가 빈 문자열 → 제너럴 스텁으로 폴백해버린다.
// (1) 정상 JSON.parse 시도 → (2) 실패하면 synthesis 필드만 정규식으로 추출해
// 이스케이프를 풀어 복구. 어느 쪽이 쓰였는지 + 실패 사유를 로그로 남겨,
// 진짜 LLM이 도는지/왜 폴백되는지 서버 로그에서 바로 보이게 한다.
function parseSynthesis(rawText: string, task: string): string {
  // Claude/Gemini 가 종종 ```json ... ``` 펜스로 감싸서 응답.
  // 펜스 끝(```) 이 maxTokens 한계로 잘려 사라지면 정규식 매칭 실패로
  // 이어지므로, 시작 펜스만이라도 떼어내고 진행한다. 종료 펜스가 있으면
  // 그것도 함께 제거.
  const text = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // (1) 정상 흐름: `{ ... }` 그리디 매치 후 JSON.parse.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { synthesis?: string };
      const synthesis = (parsed.synthesis ?? "").trim();
      if (synthesis) return synthesis;
      console.warn(`[v3 LLM][${task}] JSON parsed but synthesis empty.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[v3 LLM][${task}] strict JSON.parse failed (${msg}); trying loose extraction.`);
    }
  }

  // (2) 닫는 `}` 가 잘려서 매치 실패하거나 JSON.parse 실패한 경우의 폴백:
  //     `"synthesis": "..."` 만 정규식으로 끝까지 끄집어내서 복구.
  //     본문이 토큰 한계로 중간에 잘렸어도, 거기까지의 BEAT 들은 살린다.
  const loose = text.match(/"synthesis"\s*:\s*"([\s\S]*?)(?:"\s*\}?\s*$|$)/);
  if (loose?.[1]) {
    const recovered = loose[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
    if (recovered) {
      console.warn(`[v3 LLM][${task}] recovered via loose extraction (${recovered.length} chars).`);
      return recovered;
    }
  }

  console.warn(`[v3 LLM][${task}] could not recover synthesis. raw head: ${text.slice(0, 200)}`);
  return "";
}

// ──────────────────────────────────────────────────────────────────────────
// Branch judging (replaces heuristic for follow-up scenes).
// Classifies a participant answer into A/B/C/D based on what's missing,
// so the editor can pick the right follow-up.
// ──────────────────────────────────────────────────────────────────────────

type JudgeRule =
  | "ch1FlowAnswer"
  | "ch2Common"
  | "ch2IdentityName"
  | "ch3FutureSelf"
  | "ch3FutureDay"
  | "ch3VisionLine"
  | "ch3Attraction"
  | "ch3AlreadyDoing"
  | "ch3Obstacles"
  | "ch3WhyReason"
  | "ch3Contribution"
  | "ch4FirstStep"
  | "ch4SupportPerson"
  | "ch4NeededResource";

interface RuleSpec {
  context: string;
  letters: ("A" | "B" | "C" | "D")[];
  cases: string;  // 케이스 정의 텍스트 (LLM 프롬프트에 그대로 삽입)
}

const RULE_SPECS: Record<JudgeRule, RuleSpec> = {
  ch1FlowAnswer: {
    context: "참가자가 '일하면서 시간 가는 줄 모르고 빠져들었던 경험'에 대해 답한 내용",
    letters: ["A", "B", "D"],
    cases: `[3가지 평가축]
- 구체성: 추상이 아닌 실제 장면·맥락이 있는가 (언제·어디서·무엇을·누구와)
- 감정·생각: 사실 나열이 아닌 본인의 느낌·해석이 있는가 (감정 단어 또는 내적 반응)
- 본인성: 본인 이야기가 주어인가 ("제가 그때..." vs "다들 그렇잖아요")

[엄격 판정 — 본인성은 '주어'만 있으면 자동 충족이라 사실상 거의 항상 ✓. 그래서 D 판정은 '구체성 + 감정·생각' 둘 다 충족할 때만.]

A. 감정·생각 부족 — 구체적 장면(언제·어디서·뭘 했는지)은 있으나 본인의 마음 결·해석이 없음
   예: "작년에 신규 캠페인 기획을 맡았을 때요" (어떤 감정이었는지 없음)
   예: "대외활동에서 다른 학교 학생들보다 좋은 성과를 냈어요" (성과만 있고 그때 마음이 어땠는지 없음)

B. 장면 없음 — 장면·맥락이 흐릿하거나 매우 추상적
   예: "일이 잘 풀렸을 때요", "성공했을 때요", "뭔가 잘됐을 때"
   장면이 한 줄 짧게 있어도 "어디서·뭘·언제"가 모호하면 B로.

D. 충분 — 구체성과 감정·생각 두 축 모두 명확히 충족
   - "구체성"은 '활동의 종류 + 맥락 한 두 조각(장소/시기/사람/방식)'이 들어가야 함. 단순 결과만으론 부족.
   - "감정·생각"은 '설렜다 / 몰입했다 / 시간이 안 갔다 / 손이 멈추지 않았다' 같은 내적 반응 단어 또는 묘사가 들어가야 함.
   - 둘 다 충족할 때만 D. 한 축만 충족이면 부족한 축의 A나 B로 보낸다.

[참고: 답변이 매우 짧거나(20자 미만) 결과/성과만 말하고 끝나면 거의 D가 아니다 — A나 B로 판정해서 한 번 더 짚어주는 것이 자연스럽다.]`,
  },
  ch2Common: {
    context: "두 이야기에 흐르는 공통 패턴을 찾아달라는 질문에 답한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 표면적 공통점 — 활동/상황만 묶음 (감정·동인 없음)
   예: "둘 다 새로운 걸 배우는 거였어요", "둘 다 팀 작업이었어요"

B. 모르겠음 — 패턴을 찾지 못함
   예: "잘 모르겠어요", "비슷한 게 없는 것 같아요"

D. 깊은 공통점 — 감정/동인/의미 차원에서 본질을 짚음
   예: "둘 다 누군가의 막막함을 풀어주는 순간이었던 것 같아요"`,
  },
  ch2IdentityName: {
    context: "자기 자신에게 붙이는 이름을 답한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 너무 추상적/일반적 — 한 단어로 칭찬에 가까운 표현
   예: "좋은 사람", "행복한 사람", "멋진 사람"

B. 평이한 명사 한 단어 — 어디서나 쓰는 직책·역할 명사 그 자체
   예: "리더", "개척자", "도와주는 사람"
   ※ 단어가 같더라도 비유/구체적 수식어/본인 맥락이 붙어 있으면 B 아님 (D로).

D. 본인다운 답변 — 비유·이미지·본인만의 결이 살아있는 표현
   예: "막막함을 풀어주는 사람", "조용한 발견자",
        "지도가 없는 곳에 선을 긋는 항해사",
        "새로운 항로를 그려내는 사람"
   ※ 25자 이상이거나 비유·구체 묘사·본인 경험이 들어가 있으면 거의 항상 D.
   ※ 길이가 길고 한 줄이 아닌 문장형 답변(여러 문장, 본인 설명 포함)은 무조건 D.`,
  },
  ch3FutureSelf: {
    context: "5년 후 자기 모습을 답한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 외적 성취 중심 — 직책/타이틀 위주
   예: "팀장이 되어있을 거예요", "임원으로 승진"

B. 추상적 또는 모르겠음 — 구체적 모습 없음
   예: "성공했을 거예요", "행복하게 살고 있을 거예요", "잘 모르겠어요"

D. 풍부한 답변 — 모습·마음·일상이 살아있음`,
  },
  ch3FutureDay: {
    context: "5년 후 어느 하루를 묘사한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 일정 나열만 — 감정·마음 없음
   예: "오전엔 회의, 오후엔 보고서"

B. 너무 짧음/막연함

D. 풍부한 답변 — 마음의 흐름과 구체적 행동이 함께 있음`,
  },
  ch3VisionLine: {
    context: "비전을 한 줄로 표현한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 너무 일반적
   예: "성공한 사람", "좋은 리더가 되어있는 사람"

B. 직책·외적 표현
   예: "팀장이 될 거예요", "임원으로 자리잡은 사람"

D. 본인다운 한 줄 — 정체성·가치·미래 모습이 녹아있는 한 문장`,
  },
  ch4FirstStep: {
    context: "내일부터 시작할 작은 한 걸음을 답한 내용",
    letters: ["A", "B", "D"],
    cases: `A. 너무 추상적 또는 의무감 톤
   예: "열심히 할 거예요", "꾸준히 노력해야겠어요", "~해야겠어요"

B. 너무 큰 결심 — 내일 시작할 수 없는 것
   예: "이직 준비를 시작할 거예요", "MBA 지원"

D. 구체적이고 본인다운 — 내일 실행 가능한 작은 한 걸음`,
  },
  ch4SupportPerson: {
    context: "그 첫 걸음을 함께 시작할 사람을 답한 내용. 이 질문은 필수가 아니다 — 답이 없어도 괜찮다.",
    letters: ["D"],
    cases: `D. 항상 D로 분류한다. 구체적인 사람을 떠올렸든("김부장님", "예전 사수"),
   떠올리지 못했든("없어요", "잘 모르겠어요", "딱히") — 이 단계는 공감하며
   자연스럽게 넘어간다. 절대 되묻지 않는다.`,
  },
  ch4NeededResource: {
    context: "그 첫 걸음을 더 단단하게 만들어줄 자원을 답한 내용. 이 질문은 필수가 아니다 — 답이 없어도 괜찮다.",
    letters: ["D"],
    cases: `D. 항상 D로 분류한다. 구체적인 자원을 떠올렸든("관련 책", "선배의 조언"),
   떠올리지 못했든("없어요", "잘 모르겠어요", "딱히") — 이 단계는 공감하며
   자연스럽게 넘어간다. 절대 되묻지 않는다.`,
  },
  ch3Attraction: {
    context: "'이런 걸 더 해보고 싶다'는 끌림에 대해 답한 내용",
    letters: ["A", "D"],
    cases: `A. 너무 막연함 — 구체적 내용 없음
   예: "잘 모르겠어요", "그냥 더 잘하고 싶어요", "성장하고 싶어요"

D. 충분 — 어떤 일이나 모습인지 실마리가 보임`,
  },
  ch3AlreadyDoing: {
    context: "끌림이 일상 어딘가에 이미 있는지, 이미 하고 있는 게 있는지 답한 내용",
    letters: ["A", "D"],
    cases: `A. 너무 막연하거나 이유 없이 회피함
   예: "잘 모르겠어요", "딱히 없는 것 같아요" (설명 없음)
   ※ "없어요"이지만 근거를 말하면 D

D. 충분 — 구체적으로 언급하거나 없는 이유를 솔직히 말함`,
  },
  ch3Obstacles: {
    context: "끌림을 따라가는 데 걸리는 장애물을 답한 내용",
    letters: ["A", "D"],
    cases: `A. 너무 짧거나 막연함
   예: "잘 모르겠어요", "딱히 없어요"

D. 충분 — 어떤 부분이 어렵거나 걸리는지 구체적으로 말함`,
  },
  ch3WhyReason: {
    context: "장애물에도 그쪽으로 향하고 싶은 이유를 답한 내용",
    letters: ["A", "D"],
    cases: `A. 너무 일반적 — 개인적 동기 없음
   예: "그냥요", "하고 싶어서요", "잘 모르겠어요"

D. 충분 — 개인적인 이유나 동기가 담겨있음`,
  },
  ch3Contribution: {
    context: "세상에 어떤 기여를 하고 싶은지 답한 내용",
    letters: ["A", "D"],
    cases: `A. 너무 추상적/일반적
   예: "도움이 되고 싶어요", "좋은 사람이 되고 싶어요"

D. 충분 — 어떤 방향으로 영향을 미치고 싶은지 감각이 있음`,
  },
};

export async function v3JudgeBranch(input: {
  rule: JudgeRule;
  answer: string;
}): Promise<{ branch: "A" | "B" | "C" | "D"; reason: string }> {
  const spec = RULE_SPECS[input.rule];
  const allowed = spec.letters.join("/");
  const baseUser = `[질문 맥락] ${spec.context}

[참가자 답변]
${input.answer}

다음 케이스 중 하나를 골라주세요.

${spec.cases}

[출력 형식 — 다른 텍스트·해설 금지]
BRANCH: <${allowed} 중 한 글자만>
REASON: <한 문장 근거, 30자 이내>`;

  // 분류 전용 CLASSIFIER_PERSONA로 호출 + 형식 위반 시 1회 재시도. 두 번 다
  // 형식을 못 맞추면 throw(→500) 대신 휴리스틱으로 폴백한다 — 어떤 입력에도
  // 라우트가 절대 500을 내지 않게 하는 안전망. (클라도 동일 휴리스틱을 갖고
  // 있지만, 서버가 200으로 정상 분기를 돌려주면 불필요한 에러 round-trip이 사라진다.)
  const MAX_ATTEMPTS = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}

[⚠️ 재요청] 직전 출력이 형식을 어겼습니다. 인사·되묻기·설명·문장 금지. 첫 줄을 정확히 "BRANCH: " 로 시작해 ${allowed} 중 한 글자만 내세요.`;
    const r = await ask(user, 100, CLASSIFIER_PERSONA);
    const text = r.text.trim();
    const bm = text.match(/BRANCH:\s*([ABCD])/i);
    const rm = text.match(/REASON:\s*([^\n]+)/);
    if (bm) {
      const branch = bm[1].toUpperCase() as "A" | "B" | "C" | "D";
      if (spec.letters.includes(branch)) {
        return { branch, reason: (rm?.[1] || "").trim() };
      }
      // 규칙이 허용 안 하는 글자 → 재시도 트리거(루프 계속).
      console.warn(
        `[v3JudgeBranch] attempt ${attempt + 1}: branch ${branch} not allowed for rule ${input.rule}`,
      );
    } else {
      console.warn(
        `[v3JudgeBranch] attempt ${attempt + 1} bad output (no BRANCH): ${text.slice(0, 80)}`,
      );
    }
  }

  // 재시도까지 실패 → 휴리스틱 폴백(절대 throw/500 금지). JudgeRule ≡ BranchRule.
  console.warn(`[v3JudgeBranch] all ${MAX_ATTEMPTS} attempts failed for rule ${input.rule} → heuristic fallback`);
  return judgeBranchHeuristic(input.rule, input.answer);
}

// LLM 출력 검증 함수들 — 비문법적 조사 부착 / 사용자 어구 그대로 사용 감지
function hasBadKoreanPattern(text: string): boolean {
  // 동사/형용사 어간(라서/어서/아서/니까/면서)에 명사 조사(이/은/을/를)가 붙은 비문법
  // 예: "처음이라서이", "어려워서은", "막막해서을"
  const badPatterns = [
    /(?:라서|어서|아서|니까|면서|라고)(?:이|은|을|를|이서|에서)(?=\s|$|[가-힣])/,
    // 어미(요/군요/네요/셨)에 명사 조사가 붙은 경우
    /(?:군요|네요|아요|어요|셨|이에요)(?:이|은|을|를)(?=\s|$|[가-힣])/,
  ];
  return badPatterns.some((p) => p.test(text));
}

function userPhraseLeaked(answer: string, output: string): boolean {
  // 사용자 답변에서 "[글자]+ + 라서/어서/아서" 형태 어구 추출
  const verbPhrases = answer.match(/[가-힣]+(?:라서|어서|아서)/g) ?? [];
  // 이런 어구가 출력에 그대로 들어가면 leak
  return verbPhrases.some((p) => p.length >= 3 && output.includes(p));
}

const FALLBACK_COMFORT_REASSURE = (name: string): string =>
  `아, ${name}님 마음 한구석에 그런 결이 있으셨군요.\n\n괜찮아요 — 이 열차에 함께하는 동안 그 마음은 천천히 가라앉을 거예요.`;

export async function v3ComfortReassure(input: { answer: string; name: string }): Promise<string> {
  const user = `${input.name}님이 비전 익스프레스 객실에 처음 자리 잡으며 이렇게 말했어요.

[참가자가 어색해하는 부분]
${input.answer}

이 답변에 두 문장으로 응답해주세요.

[⚠️ 가장 중요한 규칙 — 절대 위반 금지]
- **사용자가 답변에 쓴 구체적인 핵심 명사(예: "부엉이", "카메라", "사람들", "마이크", "회의실")는 그대로 인용해야 자연스럽습니다.** 그 명사를 일반화·추상화하면 ("말하는 존재", "주변 환경") 답변과 동떨어진 공허한 응답이 됩니다.
- 단, 동사·형용사·어미("어색해요", "처음이라서", "막막해요")는 명사형 감정·상황어로 재해석하세요. 그래야 조사가 자연스럽게 붙습니다.
- 예시:
  - "처음이라서 어색해요" → "처음의 머쓱함" (동사구를 명사화)
  - "부엉이가 말하는 게 어색해요" → "**부엉이**가 말을 거는 낯섦" / "부엉이 앞에 앉은 머쓱함" (명사 '부엉이'는 유지)
  - "사람들이 많아서 부담돼요" → "**사람들** 시선의 무게" (명사 '사람들'은 유지)
  - "잘 모르겠어요/막막해요" → "막막함", "갈피를 못 잡는 느낌"

[⚠️ 절대 규칙 — 사용자 답변마다 출력이 달라야 합니다]
- 사용자가 어떤 답변을 했는지 **반드시 첫 문장에 구체적으로 반영**하세요.
- 같은 응답 템플릿을 반복하지 마세요. "머쓱함", "낯섦" 같은 단어를 디폴트로 쓰지 말고, 사용자 답변에서 두드러진 감정/상황을 직접 골라 명사화하세요.
- 사용자 답변과 무관한 일반적 응답("그런 결이 있으셨군요" / "말하는 존재" 같은 공허한 추상화)은 절대 금지.
- 사용자가 답변에 명시한 **구체 명사를 빼버리지 마세요** (가장 흔한 실수).

[출력 형식 — 다른 텍스트·해설 금지]
첫 번째 문장: "아, ~~" 로 시작. 사용자 답변에서 가장 두드러진 감정/상황을 명사로 짚으며 부드럽게 받기. 사용자 답변마다 다른 단어가 나와야 함.
두 번째 문장: "괜찮아요." 또는 "괜찮습니다." 로 시작해, 이 열차에 함께하는 동안 그 마음이 자연스럽게 풀릴 거라는 안심을 주기. 첫 문장에서 짚은 단어를 한 번 더 자연스럽게 호명할 것.

[참고 — 답변별로 다른 응답이어야 합니다. 구체 명사는 그대로 인용]
- "처음이라서 어색해요" → "아, 첫 자리의 머쓱함이 있으셨군요."
- "사람들이 많아서 부담돼요" → "아, **사람들** 시선의 무게가 느껴지셨군요."
- "부엉이가 말을 해서 어색해요" → "아, **부엉이**가 말을 거는 낯섦이 있으셨군요."
- "카메라를 보는 게 부담돼요" → "아, **카메라** 앞에 앉은 머쓱함이 있으셨군요."
- "내 이야기를 꺼낼 자신이 없어요" → "아, 이야기를 꺼낼 망설임이 있으셨군요."

핵심: **사용자 답변에 등장하는 구체 명사(부엉이/카메라/사람들 등)는 첫 문장에 그대로 들어가야 합니다.** 명사를 빼고 일반화하면 답변과 동떨어진 응답이 됩니다.

[나쁜 예시 — 절대 이렇게 하지 마세요]
- "아, 처음이라서이 어색하셨군요." (조사 비문법)
- "아, 그런 결이 있으셨군요." (답변 내용 반영 안 됨, 공허한 응답)
- "부엉이가 어색해요" → "아, 말하는 존재와 마주 앉는 낯섦이 있으셨군요." (구체 명사 '부엉이'를 일반화해서 사라짐 — 절대 금지)
- 답변과 무관하게 항상 "머쓱함/낯섦/풀릴 거예요" 같은 동일 패턴 반복

${EDITORIAL_PROSE_CONSTRAINT}

요건:
- 사용자 표현 그대로 인용 절대 금지 — 의미만 읽고 본인 언어로
- 평가·교훈조 금지. 따뜻한 편집장의 짧은 응답 톤
- 두 문장 합쳐 60~110자, 두 문장은 빈 줄(\\n\\n)로 구분
- 조사는 받침/모음 규칙에 맞게 정확히 사용 (이/가, 은/는, 을/를)`;

  // 최대 2회 시도 — 비문법적 패턴 / 사용자 어구 leak 검출되면 재시도
  // 두 번 다 실패하면 안전한 fallback 사용
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ask(user, 220);
    const out = r.text.trim();
    const hasBad = hasBadKoreanPattern(out);
    const leaked = userPhraseLeaked(input.answer, out);
    if (!hasBad && !leaked) {
      return out;
    }
    console.warn(
      `[v3ComfortReassure] attempt ${attempt + 1} rejected — hasBad=${hasBad}, leaked=${leaked}, output: ${out.slice(0, 80)}`
    );
  }
  return FALLBACK_COMFORT_REASSURE(input.name);
}

const REFLECT_GLOBAL_RULES = `[전역 규칙 — 모든 챕터 공통]
- 답변에 그대로 머물 것. 은유·재정의·재해석으로 한 단계 띄우지 말 것
- 사용자가 쓴 핵심 표현 1~2개는 그대로 인용해도 좋음 (모든 단어를 베끼지는 말 것)
- 사용자가 세운 프레임(목적·수치·방법·의도)을 부정("~게 아니라")하거나 다른 의미로 갈아끼우지 말 것
- 시적 모드 디폴트 금지 — 차분하고 담백한 톤이 기본
- 평가·교훈조 금지`;

// Applies to every topic: a "없어요/모르겠어요/딱히" answer must NOT be
// inflated into a grand "결단" or re-framed as something the question didn't
// ask. Just receive the blank state plainly. (Root cause of the Ch4 bug:
// "없어요" to the supportPerson question got read as "행동이 없다".)
const REFLECT_NEGATIVE_GUARD = `※ 답변이 "없어요 / 모르겠어요 / 딱히 없어요 / 아직" 등 비어있거나 막연한 응답이면:
- 억지로 의미를 부여하거나 "결단"으로 미화하지 말 것.
- 질문이 묻지 않은 다른 것(예: 행동·계획)으로 바꿔 읽지 말 것.
- 문장 1: "아직 떠오르지 않으셨군요" / "지금은 잘 모르겠다고 느끼시는군요"처럼 그 상태를 그대로, 부담 없이 받아주는 한 줄.
- 문장 2: 압박·응원 없이 "그것도 괜찮아요, 천천히 떠올려봐도 돼요" 결의 가벼운 한 줄.`;

function reflectShortStyleGuide(chapter: 1 | 2 | 3 | 4, name: string, topic?: string): string {
  // ── Chapter 4 — three distinct question types. Chapter alone can't tell
  // them apart, so branch on `topic` (the followup's parentSaveTo). ──
  if (chapter === 4) {
    if (topic === "supportPerson") {
      return `※ 이 답변은 '첫 걸음을 함께할 사람 — 동료·선배·가까운 누군가'에 대한 답변입니다.
이 답변을 '행동·계획'으로 읽으면 안 됩니다. 이건 '사람'에 대한 답변입니다.

[문장 1 — 받아주기]
답변 속 사람·관계를 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, [그 사람/관계]을 떠올리셨군요." / "아, [관계]와 함께 시작하고 싶으신 거네요."
- 25~45자

[문장 2 — 짧은 인정]
그 사람을 떠올린 마음에 깃든 결을 한 줄로 인정.
- 형식 예시: "그분이라면 곁에서 같이 걸어줄 것 같아요."
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
    }
    if (topic === "neededResource") {
      return `※ 이 답변은 '첫 걸음에 필요한 도움·자원 — 자료·배움·시간·공간 등'에 대한 답변입니다.
이 답변을 '행동·계획'이나 '사람'으로 읽으면 안 됩니다. 이건 '필요한 자원'에 대한 답변입니다.

[문장 1 — 받아주기]
답변 속 필요한 자원을 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, [필요한 것]이 있으면 좋겠다고 느끼시는군요."
- 25~45자

[문장 2 — 짧은 인정]
무엇이 필요한지 알아챈 시선에 깃든 결을 한 줄로 인정.
- 형식 예시: "무엇이 필요한지 아는 것부터가 이미 한 걸음이에요."
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
    }
    if (topic === "supportPersonAndResource") {
      return `※ 이 답변은 직전 두 질문 — '첫 걸음을 함께할 사람'(인물)과 '첫 걸음에 필요한 도움·자원'(자원) — 두 답변이 한 묶음으로 전달된 것입니다. 두 답변 모두에 기반해 통합된 반향을 짧게 만들어주세요.
참가자가 '[함께할 사람]'과 '[필요한 자원]' 두 섹션으로 적어 보냈다는 점을 인지하되, 출력에는 그 라벨을 그대로 노출하지 말고 자연스러운 한국어로 녹여내세요.

[문장 1 — 받아주기]
'인물'과 '자원'을 한 호흡에 함께 짚는 한 줄.
- 형식 예시: "아, [그분/관계]을 곁에 두고 [필요한 자원]을 손에 쥐고 가시려는 거네요."
- 두 요소를 모두 자연스럽게 포함. 한 쪽이 비어 있으면 채워진 쪽만 부드럽게 짚기.
- 30~55자

[문장 2 — 짧은 인정]
사람과 자원을 함께 떠올린 그 시선에 깃든 결을 한 줄로 인정.
- 형식 예시: "곁의 사람과 손에 쥔 것 — 그 두 가지가 첫 걸음을 단단하게 만들어 줄 것 같아요."
- 한 답변에만 머무르지 말고 '둘이 어떻게 같이 받쳐주는지'를 짧게 비추기.
- 35~60자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
    }
    // default Ch4 — firstStep (the action/plan itself)
    return `※ 이 답변은 '내일부터 시도해볼 행동·실험·계획'입니다. 사용자의 결단을 그대로 인정해주세요.

[문장 1 — 받아주기]
답변 속 구체적 행동·계획을 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, 내일부터 바로 [핵심 행동] 해보시려는 거네요." / "아, [핵심 변화]부터 시작해보시려는 거군요."
- 사용자가 명시한 수치·방법·목적은 그대로 비춰주기
- 25~45자

[문장 2 — 결단 인정]
그 결단에 깃든 태도를 그대로 이름 붙여주는 한 줄.
- 형식 예시: "그 작은 실험부터 시작하시는 게 단단하게 들려요." / "내일 아침을 미루지 않으시는 그 결단이 인상적이에요."
- 추상화·은유·재해석 금지 — 구체적 결단을 인정하는 응원 톤
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
  }
  if (chapter === 3) {
    if (topic === "alreadyDoing") {
      return `※ 이 답변은 '그 끌림을 향해 사용자가 이미 일상에서 하고 있는 것 — 작은 시도·경험·습관'에 대한 답변입니다.
이 답변을 '미래·앞으로의 모습'으로 읽으면 안 됩니다. 이건 이미 현재진행형으로 하고 있는 일에 대한 답변입니다.

[문장 1 — 받아주기]
답변 속 '이미 하고 있는 일'을 현재완료/현재진행 결로 짚어 받아주는 한 줄.
- 형식 예시: "아, [핵심 행위/장면 — 사용자 표현 일부 그대로 인용 OK]에 대해 이미 고민하고 계셨군요." / "아, 이미 [구체적 행동]을 해오고 계셨네요." / "아, [장면]을 이미 일상에서 하고 계시는군요."
- 절대 금지 표현: "~한 미래를 그리고 계시는군요", "~한 모습을 그려가시는군요" 등 미래·이상 프레임. 이미 일어나고 있는 일을 미래형으로 바꿔 읽지 말 것.
- 25~45자

[문장 2 — 짧은 인정]
이미 그 방향으로 움직이고 있다는 사실에 깃든 결을 한 줄로 인정.
- 형식 예시(매번 다른 마무리로):
  · "거기에는 ${name}님이 [구체적 자세]로 한 걸음씩 다가가고 있는 모습이 보여요."
  · "그 작은 시도 안에 [구체적 태도]가 이미 자리 잡고 있는 것 같아요."
  · "그런 [구체적 자세]가 ${name}님답게 느껴져요."
- 거창한 은유·재정의 금지 — 이미 하고 있는 그 모습에 머무르며 인정
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
    }
    return `※ 이 답변은 '앞으로 향하고 싶은 방향, 그 길에서 끌리거나 걸리는 것'에 대한 답변입니다. 그 결을 함께 들여다보는 시선으로 받아주세요.

[문장 1 — 받아주기]
답변 속 미래 장면을 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, [핵심 장면 — 사용자 표현 일부 그대로 인용 OK]같은 미래를 그리고 계시는군요."
- 25~45자

[문장 2 — 가능성 인정]
그 미래 안에 흐르는 본인다움을 짧게 짚는 한 줄.
- 형식 예시(매번 다른 마무리로 — 한 가지 패턴 반복 금지):
  · "거기에는 ${name}님이 [구체적 모습/태도]로 살아가는 모습이 보여요."
  · "그 안에 [구체적 태도]가 단단히 자리 잡고 있는 것 같아요."
  · "그런 [구체적 자세]가 ${name}님답게 느껴져요."
  · "거기엔 [구체적 모습]이 묻어나요."
  - "~결이 보여요" 패턴은 반복 사용 금지 — 위 변형 중 골라 쓸 것.
- 거창한 은유·재정의 금지 — 답변 속 장면에 머무르며 인정
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
  }
  if (chapter === 2) {
    return `※ 이 답변은 '본인의 가치·정체성 정의'에 대한 답변입니다. 사용자가 부여한 의미를 발견하는 시선으로 받아주세요.

[문장 1 — 받아주기]
답변 속 정의·관점을 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, [핵심 의미 — 사용자 표현 일부 인용 OK]같은 결로 그 단어를 쓰시는군요."
- 25~45자

[문장 2 — 짧은 인정]
그 정의에 깃든 결을 한 줄로 인정.
- 형식 예시: "그 안에는 [구체적 태도/관점]이 들어있는 것 같아요."
- 추상적 본질 재정의 금지 — 답변에 머무르며 인정
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
  }
  // chapter 1 — recall of a past moment
  return `※ 이 답변은 '몰입·자랑스러웠던 과거 순간'에 대한 답변입니다. 함께 떠올리며 받아주세요.

[문장 1 — 받아주기]
답변 속 상황·일·사건을 짧게 짚어 받아주는 한 줄.
- 형식 예시: "아, [핵심 상황 — 사용자 표현 일부 인용 OK]같은 일이 있으셨군요." / "아, [핵심]셨군요."
- 25~45자

[문장 2 — 짧은 인정]
그 순간에 깃든 태도·결을 한 줄로 인정.
- 형식 예시: "그 순간에는 ${name}님이 [구체적 모습/태도]로 계셨던 것 같아요."
- 거창한 은유·재정의 금지 — 답변 속 장면에 머무르며 인정
- 30~55자

${REFLECT_NEGATIVE_GUARD}

${REFLECT_GLOBAL_RULES}`;
}

// 자모·단일문자 연타("ㅇㅇㅇㅇ…", "ㅋㅋㅋ…", "aaaa…") 같은 명백한 비답변.
// 답변이 짧다고 다 막진 않고 (짧은 진심 답변도 있어서), 문자 다양성이
// 거의 0이거나 자모만으로 이뤄진 케이스만 잡는다.
function looksLikeSpam(text: string): boolean {
  const s = text.replace(/\s+/g, "");
  if (s.length < 3) return false;
  // 같은 문자만 반복 (ㅇㅇㅇ, ㅋㅋㅋ, aaaa)
  if (new Set(s).size === 1) return true;
  // 한글 자모만 (음절 가-힣이 없음) — "ㅇㅋㅇㅋ", "ㅎㅇㅎㅇ" 같은 자모 spam
  const hasSyllable = /[가-힣]/.test(s);
  const onlyJamo = /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(s);
  if (!hasSyllable && onlyJamo && s.length >= 4) return true;
  // 문자 다양성 극단적으로 낮음 (10자 이상에서 unique 비율 < 0.2)
  if (s.length >= 10 && new Set(s).size / s.length < 0.2) return true;
  return false;
}

export async function v3ReflectShort(input: {
  answer: string;
  name: string;
  chapter?: 1 | 2 | 3 | 4;
  topic?: string;
}): Promise<string> {
  // 자모·단일문자 연타는 LLM에 그대로 보내면 "아, 'ㅇㅇㅇㅇ'라는 답변을 주셨군요"
  // 식으로 답변을 인용해 비웃는 듯한 출력이 나옴. 그 전에 부드러운 안내로 차단.
  if (looksLikeSpam(input.answer)) {
    return `아직 또렷한 장면이 떠오르지 않으셨나봐요.\n\n괜찮아요 — 천천히 다시 떠올려봐도 돼요.`;
  }
  const chapter = input.chapter ?? 1;
  const styleGuide = reflectShortStyleGuide(chapter, input.name, input.topic);
  const user = `${input.name}님이 방금 들려준 답변입니다.

[답변]
${input.answer}

이 답변에 두 문장으로 되비춰주세요.

${styleGuide}

${EDITORIAL_PROSE_CONSTRAINT}

[출력]
- 두 문장을 빈 줄(\\n\\n)으로 구분해 한 번에 출력
- 핵심 키워드에는 작은따옴표(' ')를 사용
- 해설·번호 없이 두 문장만
- 평가·교훈조 금지${deepSuffix(input.name)}`;
  // deep 모드는 3문단 200~360자 출력이라 토큰을 더 줘야 잘림 방지.
  const r = await ask(user, getDeep() ? 1000 : 280);
  return r.text.trim();
}

export async function v3RephraseLight(input: { answer: string; name: string }): Promise<string> {
  const user = `${input.name}님이 직접 들려준 답변을, 매거진 페이지에 그대로 인용할 수 있도록 가볍게 다듬어주세요.

[원문]
${input.answer}

요건:
- 의미·내용은 90% 이상 그대로 보존 — 새로운 정보 추가·삭제 금지
- 구어체 군더더기만 정리: "그냥", "되게", "막", "약간", "음", 중복된 어미·말끝 흐림 등
- 첫 어구와 끝 어미만 자연스럽게 다듬기 (예: "~좋았어" → "~좋았던 거예요" / "~좋았던 부분이에요")
- ${input.name}님이 본인의 말로 한 호흡에 다시 들려주는 톤
- 원문이 여러 문장이면 문장 수도 거의 유지
- 따옴표·해설 없이 본문만 출력`;
  const r = await ask(user, 320);
  return r.text.trim();
}

export async function v3ReflectPoetic(input: { name: string; storyA: string; storyB: string }): Promise<string> {
  const user = `${input.name}님이 들려준 두 이야기입니다.

[이야기 A]
${input.storyA}

[이야기 B]
${input.storyB}

두 이야기를 나란히 놓고 발견한 결을 한 문장으로 되비춰주세요.
- 두 이야기에 흐르는 공통된 본질을 본인의 언어로 짚어내기 (사용자 단어를 그대로 받아쓰지 말 것)
- "${input.name}님은 …" 같은 단정 대신, 발견의 시선으로
- 발견의 시선으로 — 마무리 어휘는 매번 다르게. 예: "~~한 마음이 두 이야기를 잇는 것 같아요." / "~~하는 모습이 두 장면을 관통해요." / "~~한 태도가 한 사람을 만드는 것처럼 보여요." / "~~한 결이 흐르는 것 같아요." (한 가지 패턴만 반복하지 말 것 — 특히 "결이 보여요/흐른다" 어휘 남발 금지)
- 한 문장, 40~90자, 따옴표 없이 문장만 출력${deepSuffix(input.name)}`;
  // deep 모드는 3문단 출력 — 비-deep 한도(250)로는 잘리므로 토큰 상향.
  const r = await ask(user, getDeep() ? 1000 : 250);
  return r.text.trim();
}

export async function v3ReflectValues(input: {
  name: string;
  values: { word: string; meaning: string }[];
}): Promise<string> {
  const valueLines = input.values
    .map((v, i) => `${i + 1}. ${v.word} — ${v.meaning}`)
    .join("\n");
  const user = `${input.name}님이 직접 고른 가치 단어들과 본인의 정의입니다.

[가치들]
${valueLines}

이 가치들을 하나로 엮어서 ${input.name}님이 어떤 사람인지 한 문장으로 되비춰주세요.
- 모든 가치를 순서대로 풀어쓰지 말고, 가치들 사이의 결을 자연스럽게 연결
- 각 가치의 "정의"를 그대로 베끼지 말고 본인의 언어로 다시 짚어주기
- "~~할 때 가장 힘이 나는 사람이시군요" 또는 "~~한 방식으로 살아갈 때 ${input.name}님다운 분이군요" 같은 발견의 시선으로 마무리
- 한 문장, 60~120자, 따옴표 없이 문장만 출력

예시 톤: "스스로 방향을 잡고, 믿을 수 있는 사람들과 함께, 매일 조금씩 나아지는 방식으로 일할 때 가장 힘이 나는 사람이시군요."${deepSuffix(input.name)}`;
  // deep 모드는 3문단 출력 — 비-deep 한도(320)로는 잘리므로 토큰 상향.
  const r = await ask(user, getDeep() ? 1000 : 320);
  return r.text.trim();
}

export async function v3ReflectStrength(input: {
  name: string;
  helpRequests: string;
  values: { word: string; meaning: string }[];
}): Promise<{ commonAsk: string; linkedValue: string }> {
  const valueLines = input.values
    .map((v, i) => `${i + 1}. ${v.word} — ${v.meaning}`)
    .join("\n");
  const user = `${input.name}님이 적어주신 정보입니다.

[주변에서 도움 요청 받은 일]
${input.helpRequests}

[${input.name}님이 소중히 여기는 가치들]
${valueLines}

이 두 정보를 바탕으로 두 가지를 JSON으로 추출해주세요.

1. commonAsk: 사람들이 ${input.name}님에게 들고 온 일들의 공통된 결을 한 구절(noun phrase)로. "~~하는 일" 또는 "~~한 것" 형태. 8~20자.
   예시: "아직 형태가 없는 것을 다듬는 일" / "막막함을 풀어주는 일" / "흩어진 것을 묶어내는 일"

2. linkedValue: 위 [가치들] 목록의 단어 중 commonAsk와 가장 의미상 맞닿아 있는 ONE 단어. 반드시 위 목록에 있는 단어 그대로 사용.

JSON 형태로만 출력:
{"commonAsk": "...", "linkedValue": "..."}`;
  const r = await ask(user, 300);
  const text = r.text.trim();
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON found");
    const parsed = JSON.parse(match[0]) as { commonAsk?: string; linkedValue?: string };
    return {
      commonAsk: (parsed.commonAsk ?? "").trim(),
      linkedValue: (parsed.linkedValue ?? "").trim(),
    };
  } catch {
    return { commonAsk: "", linkedValue: input.values[0]?.word ?? "" };
  }
}

export async function v3SynthesizeStrength(input: {
  name: string;
  flowExperience1: string;
  flowExperience2: string;
  commonPattern: string;
  selectedValues: { word: string; meaning: string }[];
  strengthCommonAsk: string;
  helpRequests: string;
  othersDescription: string;
}): Promise<{ synthesis: string }> {
  const valueLines = input.selectedValues
    .map((v, i) => `${i + 1}. ${v.word}${v.meaning ? ` — ${v.meaning}` : ""}`)
    .join("\n");
  const user = `${input.name}님이 들려준 다섯 가지 재료입니다.

[1. Chapter 1 — 몰입했던 두 순간]
경험 A: ${input.flowExperience1 || "—"}
경험 B: ${input.flowExperience2 || "—"}

[1-1. Chapter 1 — ${input.name}님이 두 순간에서 직접 찾아낸 공통점]
${input.commonPattern || "—"}

[2. Chapter 2 — 소중히 여기는 가치]
${valueLines || "—"}

[3. Chapter 2 — 주변에서 ${input.name}님에게 도움을 요청해온 경험 — 원본 답변]
${input.helpRequests || "—"}

[3-1. Chapter 2 — 위 경험에서 추출한 공통 결(한 구절)]
${input.strengthCommonAsk || "—"}

[4. Chapter 2 — 가까운 사람이 본 ${input.name}님]
${input.othersDescription || "—"}

당신은 매거진 STORY의 편집장 **엘아울(L-OWL)**이에요.
위 네 재료로 ${input.name}님의 강점 포트레이트를 **4개의 BEAT**로 정리해요.
이 매거진은 ${input.name}님이 읽고 무릎을 탁 칠 만한, 따뜻하지만 날카로운 엘아울의 ~어요체여야 해요.

[출력 형식 — JSON 한 객체만, BEAT 4개 모두 본문 필수]
{"synthesis": "[HEADLINE: 헤드라인1] 본문1\\n[HEADLINE: 헤드라인2] 본문2\\n[HEADLINE: 헤드라인3] 본문3\\n[HEADLINE: 헤드라인4] 본문4"}

⚠️ **절대 규칙 — BEAT 4개를 반드시 모두 채울 것**:
- 4개 미만은 출력 실패. 헤드라인만 있고 본문이 없는 BEAT는 출력 실패.
- 헤드라인과 본문은 **같은 줄**에 \`[HEADLINE: …] 본문…\` 형식으로 붙여 쓸 것. 둘 사이 \\n 절대 금지.
- 한 BEAT의 입력 재료(${"strengthCommonAsk"}, ${"othersDescription"} 등)가 비어 있으면 **다른 재료(두 장면·가치 단어·commonPattern)에서 끌어와 보완**해 본문을 채울 것. **재료·답변·데이터의 부재나 빈 상태를 본문에서 언급·암시하는 모든 표현 절대 금지** — "비어 있지만", "없지만", "부족하지만", "데이터가 없다/부족하다", "응답이 없지만", "정보가 부족해" 등 어떤 변형도 금지. 빈 경우엔 그 사실을 표 내지 말고 곧장 다른 재료로 본문을 시작할 것.

[BEAT 순서 — 반드시 이 순서대로, 4개 모두 본문 필수]
1) **두 장면을 잇는 것** — ${input.name}님이 들려준 두 장면을 관통하는 공통된 **행동/결정 방식**. ${input.name}님이 스스로 짚은 공통점("${input.commonPattern || "—"}")을 출발점으로 삼되, 그걸 그대로 받아쓰지 말고 두 장면의 구체 사건으로 한 단계 더 또렷하게 증명할 것. 본문에 "Chapter 1" 같은 내부 용어 절대 금지. "${input.name}님이 들려준 두 장면" 식으로 자연스럽게 호명.
2) **나의 강점** — ${input.helpRequests?.trim() ? `주변에서 ${input.name}님에게 도움을 요청해온 **원본 답변(위 [3] 항목)**을 정면으로 다룰 것. 그 답변에 나오는 **구체 인물·상황·요청 내용 중 최소 하나**를 짧게 짚은 뒤, 그 사건이 두 장면(Ch1)과 어떻게 같은 강점을 가리키는지 한 단계 더 해석해서 ${input.name}님만의 강점 한 줄로 종합. 추출된 공통 결("${input.strengthCommonAsk || "—"}")은 보조 단서로만 쓰고, 본문은 원본 답변의 디테일에서 시작할 것. **"지속적으로/반복해서 사람들이 들고 오는" 패턴이 보이면 그 지속성 자체를 강점의 근거로 명시할 것.**` : `두 장면에서 ${input.name}님이 자주 맡았던 역할·자세에서 길어 올린, ${input.name}님만의 강점 한 줄. 본문은 두 장면의 구체 사건으로 첫 문장부터 바로 시작할 것. 입력에 없는 재료(예: "도움 요청 사례", "기록", "주변에서의 요청" 등)는 어떤 형태로도 본문에 언급·암시 절대 금지.`}
3) **타인의 시선** — ${input.othersDescription?.trim() ? `가까운 사람의 말("${input.othersDescription}")과 ${input.name}님이 스스로 들려준 모습이 만나는 지점.` : `두 장면 속에서 주변 인물(동료·참가자·친구)이 ${input.name}님을 어떻게 봤을지 구체 사건에서 자연스럽게 길어 올린, 타인의 시선과 ${input.name}님의 자기 인식이 만나는 지점. 본문은 두 장면의 구체 사건으로 첫 문장부터 바로 시작할 것. 입력에 없는 재료(예: "가까운 사람의 말", "타인의 묘사", "주변의 평가" 등)는 어떤 형태로도 본문에 언급·암시 절대 금지.`}
4) **가치의 뿌리** — 선택한 가치 단어들이 ${input.name}님의 행동·결정의 어떤 이유가 되는지. **${input.name}님이 고른 ${input.selectedValues.length}개 가치(${input.selectedValues.map((v) => `'${v.word}'`).join(", ")})는 본문에 반드시 모두 명시적으로 인용할 것** — 일부만 언급하면 BEAT 4 실패.

[헤드라인 규칙 — 가장 중요]
- 각 BEAT는 반드시 \`[HEADLINE: ...]\`로 시작.
- 헤드라인은 **잡지 표지 카피체** — 짧고(15~25자) 가슴을 치는 한 줄.
- 예시: "판을 짜고 결과를 만드는 사람", "막막함 속에서 답을 찾아내는 자석", "안과 밖이 같은 곳을 가리키는 항해사", "${input.name}님을 움직이는 단단한 축"
- 헤드라인은 ${input.name}님 고유의 정체성을 한 단어 비유로 종합 (사람·자석·항해사·등대·기획자·디자이너 등).
- 일반적인 문장("좋은 사람", "성장하는 사람")은 헤드라인 실패.

[톤 규칙 — 엘아울 ~어요체]
- **발견의 시선 + ${input.name}님 호칭**:
  · "${input.name}님은 ~한 사람인 것 같아요"
  · "${input.name}님의 그 ~이 곧 ~이었던 거 아닐까요"
  · "~할 때 직성이 풀리는 분처럼 보여요" 같이 비춰주는 매거진 톤
- ${input.name}님 호칭을 적극 사용 (BEAT 4장 전체에서 3~6회 자연스럽게). "당신" 단어 사용 금지 — 매거진 한 호의 주인공감을 ${input.name}님 호칭으로 살릴 것.
- **~입니다/~습니다 단정체 절대 금지**. "~인 것 같아요", "~처럼 보여요", "~로 들렸어요", "~네요", "~군요" 같은 엘아울의 ~어요체만 사용.
- **내부 용어 금지**: "Chapter 1", "Chapter 2", "Ch1", "Ch2", "두 몰입 순간" 같은 우리 framing 어휘는 본문에 쓰지 말 것. 사용자 시점의 자연어("들려준 두 장면", "그때 그 순간들", "주변에서 들고 온 일들")로 풀어쓸 것.

[추상 표현 금지]
- 다음 단어는 BEAT 전체에서 절대 사용 금지: "결(texture/grain)", "수렴", "행위의 형(form)", "손길", "같은 결로 흐르고", "한 사람의 결", "윤곽이 또렷해져요", "안에서 살아있는", "비추는", "조용히 떠받치고".
- 이런 모호한 문학적 표현 대신, **명확한 행동·정체성·결정·태도**로 바꿔 쓸 것.
- 예) "같은 결이 흘러요" → "같은 행동 패턴을 보입니다" / "직접 판을 짭니다"

[구체 데이터 — 근거이되, 인용이 본문이 되지는 않도록]
- 각 BEAT 본문에는 사용자 답변에서 가져온 **고유 데이터(장소·인물·숫자·기업·이벤트·역할·시기) 1~2개**만 짧게 박을 것. 3개 이상 박지 말 것 — 인용이 분석을 덮어버림.
- **인용 ↔ 엘아울의 해석 비율은 대략 1 : 2**. 한 BEAT 안에서 "[사용자 답변의 구체 사건/표현] — 그래서 ${input.name}님은 [엘아울의 한 단계 더 들어간 재해석/패턴/정체성 명명]" 구조를 지킬 것. 답변 문장을 길게 받아쓰거나 거의 그대로 옮기지 말 것 — 짧게 단서로만 짚고, 본문의 무게는 **${input.name}님이 스스로는 보지 못했을 패턴·뿌리·정체성 한 줄**에 실을 것.
- 사용자가 읽었을 때 "내 답변이 그대로 있네"가 아니라 **"내가 한 말이 이렇게 보였구나"** 하는 재발견 감각이 나오도록.
- **LLM이 지어낸 가짜 사례·일반 예시 절대 금지.** "사람을 돕는 걸 좋아합니다" 같은 누구에게나 해당되는 일반론이 한 줄이라도 들어가면 그 BEAT 실패.
- 고유 데이터가 답변에 정말 없을 때만 행동 패턴 두 가지를 구체적으로 짚을 것 ("끝까지 직접 발로 뛰는 모습").

[Bold 강조]
- 각 BEAT 본문 안에 **\\*\\*굵게\\*\\* 마크다운으로 핵심 takeaway 1~2 phrase 강조** (예: "당신은 \\*\\*어떤 자리에서도 자기 손으로 판을 짜야 직성이 풀리는 사람\\*\\*입니다.").
- Bold는 결정적 정체성 선언이나 핵심 행동 패턴에만. 너무 자주 쓰면 효과 무.
- **명사형 종결 금지** — Bold 안이든 본문 문장이든 "~하는 것.", "~만들어내는 것.", "~지키는 것." 같이 명사 "것" + 마침표로 끊지 말 것. 항상 "~하고 있어요", "~인 것 같아요", "~네요" 등 ~어요체 완결 어미로 마무리할 것.

[길이·구조 — 매우 중요]
- 각 BEAT 본문(헤드라인 제외)은 **3~5 문장, 200~320자**. 4장 합쳐 **900~1200자**.
- **본문 내부에서 줄바꿈 절대 금지**. 헤드라인과 본문 사이도 줄바꿈 금지 — 한 BEAT는 한 줄: \`[HEADLINE: …] 본문…\`
- BEAT 사이만 \`\\n\` 한 번으로 구분. 즉 전체 문자열에는 정확히 \`\\n\` 3개만 등장.
- 각 BEAT는 다른 단어로 시작 (같은 도입 반복 금지).

[일반 금칙어]
- "정말", "참", "굉장히", "대단", "훌륭", "멋진", "완벽", "최고", "특별", 이모지.
- 카드 번호(01, 02), 카테고리 라벨("두 몰입 순간" 등)은 본문에 절대 포함 금지 — 라벨/번호는 UI가 따로 붙임.
- 헤드라인은 따옴표로 감싸지 말 것. "[HEADLINE: 판을 짜고 결과를 만드는 사람]" O / "[HEADLINE: "판을 짜고…"]" X.`;
  const r = await askSynthesis(user, 2200);
  // Soft fallback (empty) so the scene never blocks — caller falls back to stub.
  return { synthesis: parseSynthesis(r.text, "synthesizeStrength") };
}

export async function v3SynthesizeGrowthVision(input: {
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
}): Promise<{ synthesis: string }> {
  const valueLines = input.selectedValues
    .map((v, i) => `${i + 1}. ${v.word}${v.meaning ? ` — ${v.meaning}` : ""}`)
    .join("\n");
  const user = `${input.name}님이 ch1~ch3에서 들려준 모든 재료입니다. 편집장(엘 아울) 시선으로 ${input.name}님이 어떤 방향으로 성장하고 싶은 사람인지를 매거진 한 호처럼 통합 정리해주세요.

[Chapter 1 — 몰입의 두 순간]
경험 A: ${input.flowExperience1 || "—"}
경험 B: ${input.flowExperience2 || "—"}

[Chapter 2 — 가치 / 정체성 / 강점]
선택한 가치들:
${valueLines || "—"}
가장 소중한 가치: ${input.topValue || "—"}
정체성("나는 ___한 사람"): ${input.identityName || "—"}
가까운 사람이 본 ${input.name}: ${input.othersDescription || "—"}
강점 종합 (이전 비트):
${input.strengthSynthesis || "—"}

[Chapter 3 — 향하고 싶은 방향]
끌리는 것: ${input.attraction || "—"}
이미 하고 있는 것: ${input.alreadyDoing || "—"}
걸리는 것/장애물: ${input.obstacles || "—"}
향하고 싶은 이유: ${input.whyReason || "—"}
성장 방향(축): ${describeDirection(input.growthDirection)}
지금 잘 쓰는 도구: ${describeTools(input.currentTool)}
키우고 싶은 도구: ${describeTools(input.growthTool)}
기여하고 싶은 것: ${input.contribution || "—"}

직무: ${input.job || "—"}

당신은 매거진 STORY의 편집장 **엘아울(L-OWL)**이에요.
이 BEAT 4장은 **Chapter 3 — 향하는 길** 한 호의 본문이에요.
각 BEAT의 **주제·구조는 Ch3 응답**(끌림·이미 하고 있는 것·장애·기여)을 따르되,
그 주제를 추상적으로 설명하지 말고 **${input.name}님의 실제 구체 사건·사례로 증명**해 주세요.
Ch1 두 몰입 경험과 Ch2 강점 종합에 담긴 **구체 디테일(프로젝트명·플랫폼명·장소·숫자·역할·인물)을 적극 끌어와** Ch3 답변을 뒷받침하세요.
⚠️ 가장 큰 실패는 일반론으로 빠지는 것입니다. "사람을 돕는 일을 좋아합니다" 같은 누구에게나 해당되는 문장이 아니라, ${input.name}님이 실제 답변에 쓴 프로젝트·역할·사건(예: 직접 만든 무언가를 기획부터 검증까지 맡았던 장면)을 그대로 끌어와 매 BEAT에 박아 넣어야 합니다.

[Ch3 재료 → BEAT 매핑 — 반드시 이 매핑을 따르고 다른 재료를 본문 주재료로 쓰지 말 것]

BEAT 01 · 내면의 부름
- 주재료: attraction(끌리는 것) + whyReason(향하는 이유)
- 객관식 인젝션: growthDirection — ${describeDirection(input.growthDirection)}
- ⚠️ 라벨 4글자(예: '${input.growthDirection || "—"}')만 그대로 따옴표로 박지 말 것. 그 라벨의 *의미*(괄호 안 설명)를 ${input.name}님의 실제 Ch1/Ch2 사건과 묶어 **개인화된 한 문장으로 번역**할 것.
- 번역 톤 예: "지금까지 [Ch1/Ch2의 구체 사건]에서 보여준 [구체 강점]을 — 이제 [라벨 의미를 ${input.name}님 맥락으로 풀어쓴 한 절]로 옮겨가시려는 결처럼 들렸어요."
- 라벨 자체는 본문에 따옴표로 한 번 echo하되, 그 한 번은 위 번역 문장의 *뒷받침*으로만. 라벨이 takeaway가 되면 안 됨.
- 금지: "다음 역의 방향은 'X'을 향하고 있는 것 같아요" 같은 라벨만 박는 무미건조 패턴.
- 핵심: 열망과 그 열망이 이미 가리키고 있는 방향이 한 BEAT 안에서 만남.

BEAT 02 · 이미 시작된 움직임
- 주재료: alreadyDoing(이미 시도하고 있는 것)
- 객관식 인젝션: currentTool — ${describeTools(input.currentTool)}
- ⚠️ 도구 라벨 phrase("현장과 사람으로" 등)만 따옴표로 박지 말 것. 각 도구의 *의미*(괄호 안 설명)를 ${input.name}님이 alreadyDoing/Ch1/Ch2에서 실제로 어떻게 쓰고 있는지 구체 행동·사건으로 풀어쓸 것.
- 번역 톤 예: "${input.name}님이 이 움직임을 떠받치는 방식은 — [도구1 의미를 ${input.name}님 맥락으로 풀어쓴 동사구], 그리고 [도구2 의미를 풀어쓴 동사구] — 이 두 손이 자연스럽게 맞물리는 결인 것 같아요."
- 라벨 phrase는 한 번 정도만 따옴표로 echo 가능. 본문 takeaway는 *의미를 번역한 한 절*이어야 함.
- 금지: "손에 익은 'A'·'B'인 것 같아요" 류의 라벨-나열 무미건조 패턴.
- 핵심: ${input.name}님의 실행 방식을 두 도구의 *의미*로 그려내기.

BEAT 03 · 안개를 걷어낼 도구
- 주재료: obstacles(머뭇거리는 지점, 장애물)
- 객관식 인젝션: growthTool — ${describeTools(input.growthTool)}
- ⚠️ 동일 원칙: 라벨 4글자 phrase가 아니라 *의미*를 ${input.name}님의 obstacles 맥락에 맞춰 풀어쓸 것. "이 도구를 손에 쥐었을 때 어떤 안개가 어떻게 걷히는지"가 구체적으로 보여야 함.
- 번역 톤 예: "그 안개를 걷어낼 손은 — [도구1 의미를 obstacles 해소 관점에서 풀어쓴 한 절] + [도구2 의미를 풀어쓴 한 절] — 이 둘인 것 같아요."
- 라벨 phrase는 한 번 정도만 echo. takeaway는 의미 번역.
- 금지: "본능적으로 고른 건 'A'·'B'인 것 같아요" 류 패턴.
- 핵심: 장애 → 해결 도구의 인과를 한 BEAT에 완성. "이 손을 갖췄을 때 안개가 어떻게 걷힐지"가 구체적으로 보여야 함.

BEAT 04 · 종착지의 풍경
- 주재료: contribution(닿고 싶은 영향력·기여)
- 객관식 인젝션: 없음
- 핵심: 매거진의 클라이맥스. "${input.name}님이 닿고 싶은 풍경은…" 으로 시작해서 엘아울 ~어요체 피날레.
- 이 BEAT에서만 '${input.topValue || "가치"}'(가장 소중한 가치)와 '${input.identityName || "정체성"}'(이름) echo 가능 — "${input.name}님을 움직이는 '${input.topValue || "가치"}'가 이 종착지의 이유인 것 같아요" 식.

[출력 형식 — JSON 한 객체만, BEAT 4개 모두 본문 필수]
{"synthesis": "[HEADLINE: 헤드라인1] 본문1\\n[HEADLINE: 헤드라인2] 본문2\\n[HEADLINE: 헤드라인3] 본문3\\n[HEADLINE: 헤드라인4] 본문4"}

⚠️ **절대 규칙 — BEAT 4개를 반드시 모두 본문까지 채울 것**:
- 헤드라인만 있고 본문이 비어 있는 BEAT는 출력 실패.
- 헤드라인과 본문은 **같은 줄**에 \`[HEADLINE: …] 본문…\` 형식. 둘 사이 \\n 절대 금지.
- 입력 재료(alreadyDoing, blocker 등)가 비어 있어도 Ch1 두 몰입 경험과 Ch2 강점 종합에서 재료를 끌어와 본문을 채울 것. "데이터 없음" 같은 메타 코멘트 본문 금지.
- 전체 문자열에는 정확히 \\n 3개만 등장 (BEAT 사이 구분용).

[헤드라인 규칙]
- 각 BEAT는 반드시 \`[HEADLINE: ...]\`로 시작.
- 헤드라인은 **잡지 표지 카피체** — 짧고(15~25자) 가슴을 치는 한 줄.
- 예시 (각 BEAT 헤드라인 가이드):
  · BEAT 01: "열망이 이미 가리키는 방향", "${input.name}님의 나침반은 이미 한 곳을"
  · BEAT 02: "이미 시작된 항해", "행동이 먼저 말을 걸어왔다"
  · BEAT 03: "안개를 걷어낼 한 자루의 무기", "${input.name}님이 본능적으로 집어든 도구"
  · BEAT 04: "${input.name}님이 남기고 싶은 풍경", "닿고 싶은 끝, 그 자리의 빛"
- 카테고리 라벨("내면의 부름" 등) 그대로 베끼지 말 것 — 헤드라인은 사용자 답변을 종합한 고유 카피.
- 일반적·평이한 문장 금지.

[톤 규칙 — 엘아울 ~어요체]
- **발견의 시선 + ${input.name}님 호칭**: "${input.name}님은 ~한 사람인 것 같아요", "${input.name}님의 ~가 곧 ~인 거 아닐까요", "이 안개는 ~로 걷힐 것 같아요".
- ${input.name}님 호칭을 적극 사용 (BEAT 4장 전체에서 3~6회). "당신" 단어 사용 금지 — 매거진 한 호의 주인공감을 ${input.name}님 호칭으로 살릴 것.
- **~입니다/~습니다 단정체 절대 금지**. "~인 것 같아요", "~처럼 보여요", "~로 들렸어요", "~네요", "~군요" 같은 엘아울의 ~어요체만 사용.

[구체 ground 정책 — 가장 중요]
- 각 BEAT의 **주제는 Ch3 응답**이지만, 그것을 추상적으로 설명하지 말고 **${input.name}님의 실제 사건으로 증명**할 것.
- Ch1 두 몰입 경험·Ch2 강점 종합에 담긴 **구체 사건·프로젝트명·플랫폼명·장소·숫자·역할·인물**을 직접 가져와 근거로 쓸 것. (한 줄 제한 없음 — 필요하면 한 BEAT에 2~3개 구체 사례를 엮어도 좋음.)
- 권장 패턴: "[Ch3 주제 한 줄] — 이미 [Ch1/Ch2의 구체 사건]에서 [구체 행동]을 해온 ${input.name}님에게는 자연스러운 다음 발걸음인 것 같아요."
- 예) BEAT 02(이미 시작된 움직임): alreadyDoing을 말할 때 → "[Ch1/Ch2에서 ${input.name}님이 직접 만들거나 맡았던 구체 사건]에서 [구체 행동]을 해온 것처럼, 지금도 [alreadyDoing 구체 내용]을 하고 계시는 거네요."
- 일반론 금지: "사람을 돕는 걸 좋아해요", "성장을 추구해요" 같은 누구에게나 해당되는 문장이 한 줄이라도 들어가면 그 BEAT 실패.
- **내부 용어 금지**: "Chapter 1", "Chapter 2", "Ch1", "Ch2", "두 몰입 순간" 같은 우리 framing 어휘는 본문에 쓰지 말 것. "들려준 두 장면", "그때 만든 프로젝트" 같은 자연어로.

[추상 표현 금지]
- 다음 단어는 BEAT 전체에서 절대 금지: "결(texture)", "수렴", "행위의 형(form)", "손길", "같은 결로 흐르고", "한 사람의 결", "윤곽이 또렷해져요", "안에서 살아있는", "비추는", "조용히 떠받치고".
- 모호한 문학적 표현 대신, **명확한 행동·정체성·결정·태도·도구**로 바꿔 쓸 것.

[구체 데이터 강제]
- BEAT마다 ${input.name}님의 **실제 답변에서 가져온 구체 명사·사건·프로젝트·플랫폼·숫자·인물**을 **최소 2개 이상** 박아 넣을 것 (Ch1 몰입 경험 / Ch2 강점 종합 / Ch3 응답 어디서든).
- 사용자가 실제로 쓴 표현·사건을 그대로 재구성. **LLM이 지어낸 가짜 사례·일반 예시 절대 금지.**
- 객관식 선택값(growthDirection, currentTool, growthTool)은 위 매핑에 따라 정확히 해당 BEAT에서만 다루되, **라벨 그대로의 인용은 한 번 이하**로 절제하고, *라벨의 의미를 ${input.name}님 맥락으로 번역한 phrase*가 본문의 중심에 오게 할 것.

[Bold 강조]
- 각 BEAT 본문 안에 \`\\*\\*핵심 phrase\\*\\*\` 마크다운으로 takeaway 1~2개 굵게.
- 객관식 라벨 자체('${input.growthDirection || "—"}', 도구 phrase 등)에는 **bold를 절대 걸지 말 것** — 라벨은 작은따옴표로만, bold는 *의미를 ${input.name}님 맥락으로 번역한 phrase*에 걸 것.
- 예: "...이미 [구체 사건]에서 **[번역된 takeaway phrase]**을 해온 ${input.name}님답게..." 식. 라벨 'X'에 bold 금지.

[일반 금칙어 — 매거진 보이스]
- 호칭: "당신" 금지. ${input.name}님 호칭만 사용.
- 내부 framing: "Chapter 1/2/3", "Ch1/2/3", "두 몰입 순간", "5 BEAT" 같은 우리 어휘 본문 금지.

[길이·구조]
- 각 BEAT 본문(헤드라인 제외)은 **3~5 문장, 200~320자**. 4장 합쳐 **900~1200자**.
- 본문 내부에 줄바꿈 금지 — 전체가 \`\\n\` 한 번만으로 BEAT 구분.
- 각 BEAT는 다른 단어로 시작.

[일반 금칙어]
- "정말", "참", "굉장히", "대단", "훌륭", "멋진", "완벽", "최고", "특별", 이모지.
- 카드 번호(01, 02), 카테고리 라벨은 본문에 절대 포함 금지 — UI가 따로 붙임.
- 헤드라인 자체를 따옴표로 감싸지 말 것.`;
  // EDITORIAL_PROSE_CONSTRAINT(헤지 어미 강제·사용자 표현 차용 금지)를 더 이상
  // 붙이지 않는다 — 이 종합 BEAT의 단언체·구체 차용 요구와 정면 충돌해 출력을
  // 일반론으로 끌어내렸다. SYNTHESIS_PERSONA가 톤·조사 규칙을 대신 담당.
  const r = await askSynthesis(user, 2400);
  return { synthesis: parseSynthesis(r.text, "synthesizeGrowthVision") };
}

export async function v3ExtractKeyword(input: { answer: string; rule: "flow" | "common" | "future" }): Promise<string> {
  const ruleHint = {
    flow: '몰입의 결을 담은 동사형 어미 (예: "엮는", "파고드는", "다루는")',
    common: '두 이야기에 흐르는 공통 행동 패턴을 담은 동사형 어미',
    future: '미래 비전을 향하는 동사형 어미',
  }[input.rule];

  const user = `다음 답변에서 핵심 키워드를 짚어주세요.

[답변]
${input.answer}

[추출 우선순위]
1순위: 참가자가 직접 쓴 감정·가치 단어
   예) "뭔가 제가 만들어냈다는 느낌이 강하게 들었어요" → "만들어내는"
2순위: 참가자가 묘사한 행동의 본질
   예) "팀원들이 막막해할 때 제가 정리해줬어요" → "막막함을 풀어주는"
3순위: 몰입 상황에서 반복되는 속성
   예) "처음 해보는", "아무도 안 해본" 반복 → "처음 시도하는"

[규칙]
- ${ruleHint}
- "X을(를) Y는" 또는 "X에 Z하는" 류 한국어 명사+동사형 (예: "관계를 잇는", "구조를 짓는")
- 직책·역할명은 키워드가 아님 — "PM을 했을 때" → PM이 아니라 그 안의 행동
- 결과가 아닌 과정 — "성과를 냈을 때" → 성과가 아니라 어떻게 만들었는지
- 참가자가 직접 쓴 표현·비유는 그대로 살림 — 임의로 재해석하지 않음 (예: "퍼즐이 맞춰지는 순간" 은 그대로 활용)
- 3~5단어 이내 (4~14자)
- 따옴표·구두점 없이 한 줄만 출력`;
  const r = await ask(user, 80);
  return r.text.trim();
}

export async function v3ObservePattern(input: {
  name: string;
  storyA: string;
  storyB: string;
  selectedValue: string;
  valueDef: string;
}): Promise<{ situationPattern: string; behaviorPattern: string }> {
  const user = `${input.name}님의 두 이야기와 가치 카드입니다.

[이야기 A]
${input.storyA}

[이야기 B]
${input.storyB}

[고른 가치] ${input.selectedValue}
[본인이 정의한 가치 의미] ${input.valueDef}

이 답변들에 흐르는 일관된 패턴을 두 가지로 나누어 짚어주세요.

[출력 형식 — 반드시 이 형식만, 다른 텍스트·해설 금지]
SITUATION: <상황 패턴 — 어떤 자리/조건에 놓였을 때 — 명사구로>
BEHAVIOR: <행동 패턴 — 어떻게 움직일 때 — "~할 때" 부사어구로>

예시:
SITUATION: 정답이 정해지지 않은 자리
BEHAVIOR: 다른 사람의 결을 듣고 거기에 자기 길을 더할 때

요건:
- 답변에 근거가 있어야 함
- 사용자가 쓴 단어를 그대로 옮기지 말 것
- 각 12~25자`;
  const r = await ask(user, 300);
  const text = r.text.trim();
  const sm = text.match(/SITUATION:\s*([^\n]+)/);
  const bm = text.match(/BEHAVIOR:\s*([^\n]+)/);
  if (!sm || !bm) {
    throw new Error(`v3ObservePattern: bad LLM output: ${text}`);
  }
  return {
    situationPattern: sm[1].trim(),
    behaviorPattern: bm[1].trim(),
  };
}

// /deep 토글이 켜졌을 때만 챕터 기사 task 끝에 덧붙는 풍부화 블록.
// 기본 모드에서는 호출되지 않으며, 호출되면 위 [출력 형식]의 분량 제약만 덮어쓴다.
// 톤·금지 규칙(TONE_GUIDE)은 그대로 유지된다.
function buildChapterDeepBlock(): string {
  return `
[OVERRIDE — 적극 서술 모드 (위 [출력 형식]의 분량 제약보다 우선)]
- 위 [출력 형식]의 "본문 3문단, 각 문단 2~3문장" 제약을 해제한다.
- BODY는 5문단, 각 문단 3~4문장으로 쓴다.
- 각 문단은 사건을 단순히 서술하는 데 그치지 말고, 그 순간이 '무엇이었는지' 한 겹 더 해석할 것 — 참가자가 그때 무엇을 감각했고 어떤 결정을 내렸는지.
- 주어진 컨텍스트의 구체 디테일(장소·숫자·인물·시기·역할)을 더 촘촘히 본문에 엮을 것.
- 단, 위 [기록 페이지 톤 가이드]와 [금지 사항]의 모든 규칙은 그대로 유지된다 — 3인칭 회고체, 저널리스틱 산문체, 평가 형용사 금지, 그리고 주어진 컨텍스트에 없는 사실·일화·인물의 임의 생성 절대 금지.
- HEADLINE과 PULL의 형식·길이는 위 [출력 형식] 그대로.`;
}

export async function v3WriteChapterArticle(input: {
  name: string;
  gender: "그" | "그녀";
  job: string;
  chapter: 1 | 2 | 3 | 4;
  session: V3Session;
}): Promise<{ headline: string; body: string; pullQuote: string | null }> {
  const { name, gender, chapter, session } = input;
  const pron = gender;
  const genderLabel = pron === "그" ? "남자" : "여자";
  const identityTitle = extractIdentityTitle(session.identityName);

  const ctx = `[참가자] ${name} (${genderLabel})
[직무] ${session.job}
[발견한 정체성] ${identityTitle || "—"}
[가장 소중한 가치] ${session.topValue || "—"}
[본인 정의] ${session.valueDefinitions[session.topValue] || "—"}
[5년 후 모습] ${session.futureSelf || "—"}
[비전 한 줄] ${session.visionLine || "—"}
[첫 걸음] ${session.firstStep || "—"}`;

  // v3.8 13.3 / 11.4 — 매거진 인터뷰 기사 톤 가이드 (모든 챕터 공통)
  const TONE_GUIDE = `
[⚠️ 절대 규칙 — 위반 시 출력 무효]
- 참가자의 본명은 정확히 "${name}"입니다. 본문 어디에도 다른 이름을 쓰지 마세요.
- "주승주", "김지영" 같은 가상의 인물명·예시 이름을 절대 만들어내지 마세요.
- 본명이 본문에 등장할 때는 "${name}" 글자 그대로 — 변형·축약·재명명 금지.

[기록 페이지 톤 가이드 — 모든 챕터 공통]
시점: 3인칭, "${pron}"로 통일.
호명: 본명 "${name}"은 본문에 딱 한 번만 등장 — 단 첫 문장에서는 쓰지 말 것. 흐름이 자리 잡은 뒤 자연스러운 지점에서 한 번. 그 외에는 "${pron}".
   ※ 본문에 "${name}님" 같은 경어 호명 금지 — 본명 그대로만 사용. ("님" 금지)

[⚠️ 도입부 — 첫 문장만 조정 (글 전체 톤은 유지)]
- 글 전체의 톤·문단 구성은 기존대로 두고, 오직 '첫 문장'만 자연스럽게 손볼 것.
- 첫 문장을 본명("${name}")이나 주어("${pron}는 / ${pron}가")로 시작하지 말 것.
- 대신 이름 주어를 문장 중간으로 빼거나, 시간·공간적 배경·상황 묘사·핵심 대사로 열 것.
  예) "금요일 밤, 불 꺼진 사무실에서—", "'단단한 토양을 다지고 싶다'던 말이 있었다.", "해가 뜰 무렵이었다."
- 각 챕터(1~4)의 여는 방식이 서로 겹치지 않도록, 챕터별 도입 각도 힌트(각 챕터 요건)를 따를 것.

시제: 회고체 과거형 ("~했다 / ~였다 / ~떠올렸다").
문체: 매거진 인터뷰 기사의 저널리스틱 산문체. 한 호흡으로 흐르는 문장.
인용: 참가자의 핵심 표현은 작은따옴표('…')로 직접 인용. 단 답변 통째로 베끼지 말 것.
인터뷰어 관찰 표현은 안전한 일반 표현만 — 예: "잠시 눈을 감았다", "한 호흡 쉬고 말했다",
   "펜이 잠시 멈추었다", "${pron}는 천천히 입을 열었다". 과장된 묘사 금지.

[⚠️ 분량 — 반드시 지킬 것]
- 본문(BODY)은 3문단, 공백 포함 약 400자 내외(350~420자). 420자를 넘기지 말 것.
  (웹 매거진은 본문을 한 칸에 그대로 싣기 때문에, 길면 마지막 문장이 잘려 보임.)
- 단, 분량 제한 때문에 내용을 임의로 대폭 축소·압축하지 말 것. 인터뷰의 구체적
  상황과 감정선을 충분히 살려 3문단을 풍성하고 깊이 있게 채울 것.
- 마지막 문장은 반드시 마침표로 완결할 것. 문장 도중에 끊지 말 것.

[금지 사항]
- 요약 박스, 항목 나열(•/-/번호), "핵심:", "정리:" 같은 라벨 형식 금지 — 통산문만.
- L-OWL의 환기·격려 멘트("자, 다음 페이지로...") 페이지 안에 등장 금지 — 이 페이지는 결과물이지 대화가 아님.
- 참가자에게 묻는 질문 형식("어땠을까?") 금지.
- "멋진", "훌륭한", "대단한" 류 평가 형용사 금지.
- 참가자 답변에 없는 사실·일화·인물의 임의 생성 금지. 주어진 컨텍스트 안에서만.

${EDITORIAL_PROSE_CONSTRAINT}
`;


  const taskByChapter: Record<1 | 2 | 3 | 4, string> = {
    1: `${ctx}

[몰입 경험 1] ${session.flowExperience1}
[몰입 경험 2] ${session.flowExperience2}
[발견한 결] ${session.ch1PoeticMirror || "—"}

Chapter 1 — 내가 지나온 길.
${pron}가 들려준 두 몰입 경험을 매거진 본문으로 써주세요.
${TONE_GUIDE}

[출력 형식 — 다른 텍스트 금지]
HEADLINE: <챕터 헤드라인, 12자 이내>
BODY: <본문 3문단, 각 문단 2~3문장 — 묘사 + 핵심 표현 직접 인용 한 개 + 결>
PULL: <한 줄 풀쿼트, 25~45자>

요건:
- 도입(첫 문장): 그 몰입의 '순간/장면' — 시간·공간 배경(언제, 어디서)으로 열 것. 이름·주어로 시작 금지.
- 두 이야기에서 결을 발견하는 시선으로 (받아쓰지 말 것)
- v3.8 11.8 PULL 추출: 두 몰입 경험 답변 [몰입 경험 1] / [몰입 경험 2] 원문 중 가장 인상적인 한 문장(또는 그 한 토막)을 그대로 가져오기. 임의로 작성·요약하지 말 것.`,

    2: `${ctx}

Chapter 2 — 나는 누구인가.
${pron}가 발견한 자기 이름과 가치를 매거진 본문으로 써주세요.
${TONE_GUIDE}

[출력 형식 — 다른 텍스트 금지]
HEADLINE: <12자 이내>
BODY: <본문 3문단, 각 문단 2~3문장>
PULL: <한 줄 풀쿼트, 25~45자>

요건:
- 도입(첫 문장): 핵심 대사(작은따옴표 인용)나 그 이름·가치가 떠오른 '상황/장면'으로 열 것. 이름·주어로 시작 금지.
- ${pron}가 새로 붙인 이름 "${identityTitle || ""}"이 어떻게 자라났는지
- 가치 단어 "${session.topValue || ""}"가 ${pron}에게 어떤 의미인지를 본문에 풀어내기 (사전적 정의 X)
- v3.8 11.8 PULL 추출: 정체성 이름 "${identityTitle || ""}" 그대로, 또는 가치 본인 정의 원문 중 한 문장. 정체성 이름이 더 강력하면 그것. 임의 작성 금지.`,

    3: `${ctx}

[끌리는 방향] ${session.attraction || "—"}
[이미 하고 있는 것] ${session.alreadyDoing || "—"}
[그럼에도 향하는 이유] ${session.whyReason || "—"}
[세상에 미치고 싶은 영향] ${session.contribution || "—"}

Chapter 3 — 내가 그리는 미래.
${pron}가 발견한 끌림·장애물·이유·기여 꿈을 모아 매거진 본문으로 써주세요.
${TONE_GUIDE}

[출력 형식 — 다른 텍스트 금지]
HEADLINE: <12자 이내>
BODY: <본문 3문단, 각 문단 2~3문장>
PULL: <비전 한 줄 "${session.visionLine || ""}"을 활용한 풀쿼트, 25~45자>

요건:
- 도입(첫 문장): ${pron}가 그리는 미래의 한 장면(이미지)이나 '끌림'이 일렁이는 순간으로 열 것. 이름·주어로 시작 금지.
- ${pron}가 지금 끌리는 방향부터, 그럼에도 향하고 싶은 이유까지 이어지는 결로
- 거대한 직책·성취가 아니라 ${pron}만의 결이 담긴 방향으로`,

    4: `${ctx}

[지지하는 사람] ${session.supportPerson}
[필요한 자원] ${session.neededResource}

Chapter 4 — 내일로 향하는 한 걸음.
${pron}가 내일부터 시작할 작은 걸음을 매거진 본문으로 써주세요.
${TONE_GUIDE}

[출력 형식 — 다른 텍스트 금지]
HEADLINE: <12자 이내>
BODY: <본문 3문단, 각 문단 2~3문장>

요건:
- 도입(첫 문장): 내일의 구체적 행동이 일어나는 시간·장면(예: 하루의 한 틈, 어떤 시각)으로 열 것. 이름·주어로 시작 금지.
- ${pron}는 그 길을 혼자 가지 않는다 — 곁에 있는 사람과 손에 쥔 자원을 본문에 자연스럽게 엮기
- [분량 — Chapter 4 엄격] 본문 전체는 공백 포함 350~420자(절대 430자 초과 금지). 불필요한 수식어를 줄여 밀도 있게 쓸 것 — 맺음말 문장까지 포함해 430자 안에 들어와야 함.
- [맺음말 — Chapter 4 한정] 본문의 맨 마지막 문장은 반드시 "${pron}가 만들어갈 다음 호를 기대해 보자." 로 완전하게 끝맺을 것. (변형·생략 금지) 이 맺음말은 앞 문단과 빈 줄로 분리해 '독립된 새 문단'으로 둘 것.
- v3.8 11.4: Chapter 4는 풀쿼트 없음. PULL 출력하지 말 것.`,
  };

  const deep = getDeep();
  const task = deep
    ? taskByChapter[chapter] + buildChapterDeepBlock()
    : taskByChapter[chapter];
  const r = await ask(task, deep ? 1800 : 800);
  const text = r.text;
  // LLM 이 라벨을 **HEADLINE:**, **PULL:** 처럼 markdown bold 로 감싸서
  // 출력하는 경우가 있어 라벨 매칭에 \*{0,2} 허용. 또한 BODY 가 PULL 직전까지
  // 끝나도록 lookahead 도 동일 패턴 적용.
  const hm = text.match(/\*{0,2}HEADLINE\*{0,2}:\s*([^\n]+)/);
  const bm = text.match(/\*{0,2}BODY\*{0,2}:\s*([\s\S]*?)(?=\n\s*\*{0,2}PULL\*{0,2}:|$)/);
  const pm = text.match(/\*{0,2}PULL\*{0,2}:\s*([^\n]+)/);
  // 본문/헤드라인/풀쿼트에 남은 `**` bold marker 와 헤드라인 marker 제거.
  // 캐싱된 stale 데이터에도 동일 sanitize 가 필요해 MagazineArticlePage 에도
  // 같은 함수를 재사용.
  return {
    headline: cleanArticleField(hm?.[1] || ""),
    // 본문은 분량 캡 + 완결 문장 보장 — 웹 매거진 칸 넘침(중간 잘림) 방지.
    // Chapter 4는 고정 맺음말("…다음 호를 기대해 보자.")을 보존하면서 350~400자
    // 캡 적용 (clampBodyKeepingEnding — 초과 시 맺음말 앞부분만 줄임).
    body:
      chapter === 4
        ? clampBodyKeepingEnding(cleanArticleField(bm?.[1] || ""))
        : clampBodyToCompleteSentence(cleanArticleField(bm?.[1] || "")),
    // v3.8 11.4: Chapter 4는 풀쿼트 없음 — LLM이 혹시 출력해도 무시
    pullQuote: chapter === 4 ? null : (cleanArticleField(pm?.[1] || "") || null),
  };
}

// cleanArticleField 는 client/server 양쪽에서 쓰여야 해서 별도 client-safe
// 모듈(articleSanitize.ts) 로 분리. 여기서 재사용 import 만.
// (이 파일은 server-only 의존성을 가져 client 컴포넌트가 직접 임포트하면
//  Next.js Turbopack 이 node:async_hooks 못 묶어 빌드 실패.)

export async function v3WriteEditorNote(input: { session: V3Session; kind: "intro" | "outro" }): Promise<string> {
  const { session, kind } = input;
  const pron = session.gender;
  const genderLabel = pron === "그" ? "남자" : "여자";
  const identityTitle = extractIdentityTitle(session.identityName);

  if (kind === "intro") {
    // v3.8 11.4 — From the Editor 형식 강제.
    const user = `[참가자] ${session.name} (${genderLabel})
[직무] ${session.job}
[자유 입력 컨텍스트] ${session.freeContext || "—"}

매거진 STORY 편집장의 인트로 노트(From the Editor)를 써주세요.

[형식 — 반드시 이 구조를 따르세요]
- 첫 문장: "${session.name}님을 만났다." (※ 인트로 첫 문장에만 "님" 사용 OK)
- 두 번째 문장: ${session.job ? `"${pron}는 ${session.job} 일을 하는 사람이었다." 또는 "${pron}는 ${session.job} 분야에서 일하고 있었다." 같은 자연스러운 변형. **"LG의 ${session.job}였다" 같은 어색한 소속격 문장은 금지** — 그 사람의 직무를 자연스러운 한국어 문장으로 풀어쓸 것.` : `${pron}가 어떤 자리에 있는 사람인지 짧게 짚는 한 문장.`}
- 이번 호의 톤·방향을 살짝 암시하는 한 문장
- 마지막 문장: "우리는 ${pron}의 이야기를 한 호의 매거진으로 담았다." (또는 자연스러운 변형)

[원칙]
- 한 문단, 3~5문장
- ${pron}를 3인칭으로 ("그/그녀")
- 첫 문장 외에는 "${session.name}님" 같은 경어 호명 금지
- 잡지 인트로 톤. 군더더기·과장 금지 — 화려하지 않게

${EDITORIAL_PROSE_CONSTRAINT}`;
    const r = await ask(user, 400);
    return r.text.trim();
  }

  // v3.8 12.x — Editor's Note 본문. 정체성 카드 내용(핵심 가치·비전)을 노트에
  // 자연스럽게 녹여낸다. 메인 타이틀({정체성 타이틀})은 EditorOutro 컴포넌트가
  // 따로 렌더하므로 여기서는 출력하지 않는다 — 본문만.
  const coreValues = session.selectedValues.length
    ? session.selectedValues.join(", ")
    : (session.topValue || "");
  const user = `[참가자] ${session.name}
[정체성 타이틀] ${identityTitle || "—"}
[핵심 가치] ${coreValues || "—"}
[정체성 문장(비전)] ${session.visionLine || "—"}

매거진 STORY 편집장의 아웃트로 노트(Editor's Note) "본문"을 써주세요.

[고정 도입부 — ${pron} 적용해 (거의) 그대로 시작]
"우리는 묵묵히 자기 빛을 쌓아온 한 사람을 만났다. ${pron}의 이야기를 들으며, 우리는 ${pron}가 이미 자기만의 답을 가지고 있음을 깨달았다."
  ※ 위 두 문장은 거의 그대로 두되, 어색한 부분만 최소한으로 다듬을 것.
  ※ 절대 금지: "퇴근 전 10분", "개인 노트 한 페이지", "조용한 기록이 팀의 나침반" 같이 참가자가 실제로 말하지 않은 구체적 상황·사물·습관을 지어내 붙이지 말 것. 이 예시 문구들은 참고용일 뿐 출력에 넣지 말 것.

[전개 — 동적 데이터 자연스럽게 윤문 (하드코딩·기계적 나열 금지)]
- 도입부에 이어, [핵심 가치]("${coreValues}")와 [정체성 문장(비전)]("${session.visionLine}")을 반드시 본문에 녹여낼 것.
- 오직 위 [정체성 타이틀]·[핵심 가치]·[정체성 문장(비전)] 에 담긴 내용만 근거로 쓸 것. 여기에 없는 구체적 일화·시간·도구·문서·장면을 창작해서 넣지 말 것 (없는 응답을 언급하는 문제 방지).
- 변수를 그대로 이어 붙이지 말고, 앞 문단의 담담한 관찰자 에세이 톤(~했다 / ~이었다)에 완전히 스며들도록 문맥·어조를 다듬어 한 문단으로 연결.

[마무리 — 반드시 이 문장으로 완전히 끝맺기 (변형 금지)]
"이 한 호가 ${pron}의 다음 여정에 작은 등불이 되기를."

[원칙]
- ${pron}를 3인칭으로. "${session.name}님" 같은 경어 호명 금지.
- UI 한계상 너무 길어지지 않게 — 전체 공백 포함 360~420자. 문장 도중에 끊지 말 것.
- "잘 어울려요" 같은 평가 대신, 발견의 시선으로.

${EDITORIAL_PROSE_CONSTRAINT}`;
  const r = await ask(user, 500);
  return r.text.trim();
}

export async function v3GenerateVisionDirections(input: {
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
}): Promise<{ directions: string[] }> {
  const job = input.job || "직장인";
  const commonalityCh1 = input.commonPattern || "(미입력)";
  const identityCh2 = input.identityName || "(미입력)";
  const strengthCh2 = input.strengthSummary || "(미입력)";
  const inputAttraction = input.attraction || "(미입력)";
  const inputMovement = input.alreadyDoing || "";
  const inputReason = input.whyReason || "(미입력)";
  const expertiseType = input.growthDirection || "(미입력)";
  const currentToolText = input.currentTool.length > 0 ? input.currentTool.join(" / ") : "(미입력)";
  const growthToolText = input.growthTool.length > 0 ? input.growthTool.join(" / ") : "(미입력)";
  const dream = input.contribution || "(미입력)";

  const user = `참가자가 입력한 답변을 바탕으로, 참가자가 향하고 싶은 미래 방향 문장을 6개 생성합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[입력값]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 참가자의 현재 직무: ${job}
• Chapter 1 공통점 답변: ${commonalityCh1}
  (참가자가 두 경험에서 직접 찾아낸 공통점 — 행동·감정·상황·사람이 담겨있음)
• Chapter 2 자기정의 문장: ${identityCh2}
• Chapter 2 강점 패턴: ${strengthCh2}
• 끌리는 것: ${inputAttraction}
• 이미 조금 움직이고 있는 것: ${inputMovement || "(없음)"}
• 그럼에도 향하고 싶은 이유: ${inputReason}
• 전문성 결합 방식: ${expertiseType}
  ("전문성 심화" / "전문성 확장" / "전문성 연결" 중 1개)
• 지금 가장 잘 쓰는 도구: ${currentToolText} (최대 2개)
• 앞으로 더 키우고 싶은 도구: ${growthToolText} (최대 2개)
• 꿈: ${dream}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[입력값 활용 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- {끌리는 것}은 핵심 재료다. 참가자가 끌린다고 말한 구체적 언어를 반드시 2개 이상의 문장에 직접 반영할 것. "새로운 것을 만든다"처럼 추상화하지 말 것.
- {끌리는 것}이 10자 미만이거나 "모르겠다/없다/그냥" 등 막연한 경우: {향하고 싶은 이유} 중심으로 문장을 구성할 것.
- {이미 움직이고 있는 것}이 있다면 문장 1(역할 축)과 문장 3(강점 축)에 "이미 그 방향 위에 있음"의 뉘앙스를 담을 것. 없거나 짧다면 무시하고 {끌리는 것} 중심으로 작성할 것.
- {향하고 싶은 이유}는 동기의 뿌리다. 문장 안에 직접 쓰지는 않되, 그 이유가 느껴지는 방향으로 문장의 결을 맞출 것.
- {Chapter 1 공통점}에서 핵심 행동 동사를 추출해 문장 1·3에 그 행동의 결이 느껴지도록 작성할 것. 동사를 직접 쓰지 않아도 되지만 그 행동이 담긴 방식으로. 참가자가 쓴 구체적 언어를 살리되 그대로 인용하지는 말 것.
- {Chapter 2 강점 패턴}은 타인이 인정한 강점이다. 문장 3(강점 축)에 이 패턴이 반영되도록 작성할 것.
- {Chapter 2 자기정의 문장}은 이 사람이 스스로 정의한 현재 모습이다. 6개 문장이 이 정의와 충돌하지 않게, 특히 문장 6(통합 축)에서 그 결이 자연스럽게 이어지도록 작성할 것.
- {전문성 결합 방식} 활용: 문장 1·4 중 하나에 반영할 것.
  "전문성 심화" → 지금 하는 일의 본질을 더 깊이 파고드는 뉘앙스
  "전문성 확장" → 지금 전문성과 다른 새로운 영역을 병행하는 뉘앙스
  "전문성 연결" → 이미 가진 것들을 새로운 방식으로 연결하는 뉘앙스
- {지금 도구}·{키우고 싶은 도구} 활용: 문장 2·3 중 하나에 반영할 것. {지금 도구}가 기반, {키우고 싶은 도구}가 방향. 1개 선택 시 그 도구가 명확히 드러나게. 2개 선택 시 더 핵심적인 것을 중심으로, 나머지는 결로 배어있게. 4개 도구를 한 문장에 모두 나열하지 말 것. 두 묶음이 완전히 겹치면 그 도구를 더 깊이·넓게 쓰는 뉘앙스, 일부 겹치면 겹치는 도구를 강점·다른 도구를 확장 방향으로, 완전히 다르면 {지금 도구}가 기반·{키우고 싶은 도구}가 방향이 되는 문장으로.
- {꿈}은 문장 5·6에 반영할 것. 꿈을 직접 언급하지 않되, 그 꿈을 향한 변화와 대상이 느껴지도록.
- {직무}는 현재 맥락이다. 직무 언어를 자연스럽게 녹이되, {전문성 결합 방식}과 {직무}의 연결이 자연스럽지 않으면 "지금까지 쌓아온 것을 바탕으로" 축으로 대체할 것.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[생성 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 반드시 6개를 생성할 것.
2. 6개는 각각 다른 축을 건드린다:
   - 문장 1 — 역할 축: {끌리는 것}의 구체적 언어 + {전문성 결합 방식}의 방향 + {Chapter 1 공통점}의 핵심 행동의 결을 녹여 이 사람이 하는 일 자체를 정의. {이미 움직이고 있는 것}이 있으면 "이미 그 방향 위에 있음" 뉘앙스. 형식: "___을 ___하는 사람"
   - 문장 2 — 방법 축: {지금 도구}가 기반, {키우고 싶은 도구}가 방향이 되는 방식으로 이 사람만의 일하는 방식을 정의. {끌리는 것}을 직접 쓰지 않고 방식·태도에만 집중. 형식: "___을 바탕으로 ___하는 사람" 또는 "___방식으로 ___하는 사람"
   - 문장 3 — 강점 축: {Chapter 2 강점 패턴} + {지금 도구} 중 가장 강한 것 + {Chapter 1 공통점}의 핵심 행동의 결을 결합해 지금 이미 가진 강점이 드러나는 문장. {이미 움직이고 있는 것}이 있으면 반영. 형식: "___을 통해 ___하는 사람"
   - 문장 4 — 성장 축: {전문성 결합 방식} + {키우고 싶은 도구} 중 가장 키우고 싶은 것을 결합해 앞으로 쌓아가고 싶은 방향을 정의. {끌리는 것}의 언어를 중심으로 지금보다 더 넓거나 깊어진 역할로. 형식: "___을 쌓아 ___하는 사람" 또는 "___을 넘어 ___하는 사람"
   - 문장 5 — 영향 축: {꿈}의 언어를 바탕으로 이 사람의 일이 닿는 대상과 변화를 정의. {끌리는 것}이나 {직무}를 직접 쓰지 않고 영향력의 방향과 대상에만 집중. 형식: "___에게 ___을 만드는 사람" 또는 "___가 ___할 수 있도록 ___하는 사람"
   - 문장 6 — 통합 축: {끌리는 것} + {꿈} + {Chapter 2 자기정의 문장}의 결 + {향하고 싶은 이유}의 결을 하나로 엮어 현재와 미래를 하나의 서사로 담은 문장. 형식: "___하면서, 언젠가 ___하는 사람" 또는 "___을 통해, ___에 닿고 싶은 사람"
3. 6개 문장 전체에서 같은 단어가 2번 이상 반복되면 안 된다.
4. 문장 길이 — 문장 1~5: 15~40자, 문장 6: 15~50자.
5. 추상적 단어 사용 금지: 성장하는, 발전하는, 나아가는, 더 나은, 기여하는.
6. 6개 중 {끌리는 것}의 구체적 언어가 하나도 없는 문장이 4개 이상이면, 가장 범용적으로 느껴지는 문장부터 교체할 것.
7. JSON 형식으로만 응답할 것. 다른 말은 절대 붙이지 말 것.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[출력 형식 — JSON만]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{"directions":[{"id":1,"type":"role","text":"문장1"},{"id":2,"type":"method","text":"문장2"},{"id":3,"type":"strength","text":"문장3"},{"id":4,"type":"growth","text":"문장4"},{"id":5,"type":"impact","text":"문장5"},{"id":6,"type":"integration","text":"문장6"}]}`;

  const r = await ask(user, 1200);
  const text = r.text.trim();
  // Match the outermost JSON object
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("v3GenerateVisionDirections: no JSON in response");
  const obj = JSON.parse(m[0]) as {
    directions?: Array<{ id?: number; type?: string; text?: string }>;
  };
  const directions = (obj.directions ?? [])
    .map((d) => (d.text ?? "").trim())
    .filter(Boolean);
  if (directions.length < 6) {
    throw new Error(
      `v3GenerateVisionDirections: expected 6 directions, got ${directions.length}`,
    );
  }
  const six = directions.slice(0, 6);
  // Rule 4 길이(문장1~5 ≤40자, 문장6 ≤50자)는 프롬프트 가이드로만 둔다.
  // 예전엔 한 문장이라도 캡을 넘으면 throw → realLLM 이 stub(범용 6문장)으로
  // 폴백했는데, "___을 ___하는 사람" 형식의 한국어 비전 문장은 40자를 쉽게
  // 넘겨서 멀쩡한 개인화 결과가 통째로 버려지고 추상적 stub 만 노출됐다.
  // 길이 초과만으로 전체를 버리지 않고 LLM 산출물을 그대로 사용한다.
  return { directions: six };
}

// ──────────────────────────────────────────────────────────────────────────
// [ch3 wireframe Zone B — 2026-06-15] Job-category-driven trend cards.
// 와이어프레임의 "🦉 El Owl's Outside View" 섹션에 표시되는 3개 카드.
// 6-axis 추천 카드(내부 발견형) 다음에 와서 "바깥 시선" 시점으로 직무 분야
// 흐름을 보여준다. 입력은 직무 카테고리 하나만 — 참가자 데이터는 쓰지 않고,
// 직무 영역에서 주목받는 변화를 엘아울의 관찰자 시점으로 풀어쓴다.
// ──────────────────────────────────────────────────────────────────────────
export async function v3GenerateJobTrendCards(input: {
  job: string;
}): Promise<{ cards: { direction: string; context: string }[] }> {
  const job = (input.job || "").trim() || "직장인";
  const user = `당신은 "아뜰리에 페르소나" 매거진의 에디터 엘아울입니다.
참가자의 직무 영역을 보고, 그 분야에서 주목할 만한 변화의 방향을
바깥에서 포착한 시선으로 3가지 제시해주세요.

## 입력값
직무: ${job}

## 출력 규칙
- 각 카드는 "~하는 사람" 형태의 방향 문장 1개 + 맥락 문장 1개
- 방향 문장: 구체적인 행동 동사로 시작, 30자 내외
- 맥락 문장: 왜 이 방향이 주목받는지, 20자 내외로 담백하게
- 출처나 기관명 절대 언급하지 않음
- 엘아울의 관찰자 시선 유지 ("~하고 있어요", "~되고 있어요")
- 과도한 미래 예측이나 단정적 표현 지양

## 출력 형식 (JSON)
{
  "trend_cards": [
    { "direction": "~하는 사람", "context": "맥락 문장" },
    { "direction": "~하는 사람", "context": "맥락 문장" },
    { "direction": "~하는 사람", "context": "맥락 문장" }
  ]
}`;
  const r = await ask(user, 600);
  const text = r.text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("v3GenerateJobTrendCards: no JSON in response");
  const obj = JSON.parse(m[0]) as {
    trend_cards?: Array<{ direction?: string; context?: string }>;
  };
  const cards = (obj.trend_cards ?? [])
    .map((c) => ({
      direction: (c.direction ?? "").trim(),
      context: (c.context ?? "").trim(),
    }))
    .filter((c) => c.direction.length > 0);
  if (cards.length < 3) {
    throw new Error(`v3GenerateJobTrendCards: expected 3 cards, got ${cards.length}`);
  }
  return { cards: cards.slice(0, 3) };
}

export async function v3GenerateTimeHorizon(input: {
  name: string;
  job: string;
  visionLine: string;
  attraction: string;
  contribution: string;
}): Promise<{ horizon: string[] }> {
  const job = input.job || "직장인";
  const visionLine = input.visionLine || "(미입력)";
  const attraction = input.attraction || "(미입력)";
  const dream = input.contribution || "(미입력)";

  const user = `참가자가 정한 성장 방향을 시간 위에 펼친 '시간 지평' 문장 3개를 생성합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[입력값]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 이름: ${input.name || "참가자"}
• 직무: ${job}
• 나의 성장 방향 (참가자가 직접 정한 문장): ${visionLine}
• 끌리는 것: ${attraction}
• 꿈: ${dream}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[생성 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- {나의 성장 방향}을 시간 축으로 펼친다. 세 문장은 같은 방향의 1년 / 3년 / 언젠가 모습이어야 한다.
- "1년 안에, …" — 구체적이고 당장 시작 가능한 수준. {끌리는 것}의 구체적 언어를 살린 첫 행동.
- "3년 후에, …" — 어느 정도 쌓인 뒤 도달할 수 있는 수준. 역할·전문성이 자리잡은 모습.
- "언젠가, …" — 꿈에 가장 가까운 수준. {꿈}의 언어가 느껴지는 모습.
- 각 문장은 반드시 "1년 안에, " / "3년 후에, " / "언젠가, " 로 시작할 것.
- 각 문장 15~50자. 추상어 금지 (성장하는, 발전하는, 나아가는, 더 나은, 기여하는).
- 세 문장 전체에서 같은 단어가 2번 이상 반복되면 안 된다.
- JSON 형식으로만 응답할 것. 다른 말은 절대 붙이지 말 것.

[출력 형식 — JSON만]
{"horizon":["1년 안에, ...","3년 후에, ...","언젠가, ..."]}`;

  const r = await ask(user, 500);
  const text = r.text.trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("v3GenerateTimeHorizon: no JSON in response");
  const obj = JSON.parse(m[0]) as { horizon?: string[] };
  const horizon = (obj.horizon ?? []).map((s) => s.trim()).filter(Boolean);
  if (horizon.length < 3) {
    throw new Error(
      `v3GenerateTimeHorizon: expected 3 horizon lines, got ${horizon.length}`,
    );
  }
  // Ensure the time prefixes are present (the LLM occasionally drops them).
  const PREFIXES = ["1년 안에,", "3년 후에,", "언젠가,"];
  const normalized = horizon.slice(0, 3).map((s, i) => {
    const prefix = PREFIXES[i];
    return s.trimStart().startsWith(prefix.slice(0, 3)) ? s : `${prefix} ${s}`;
  });
  return { horizon: normalized };
}

export async function v3WriteCoverHeadline(input: { session: V3Session }): Promise<string> {
  const { session } = input;
  const identityTitle = extractIdentityTitle(session.identityName);
  if (!session.identityName && !session.visionLine) {
    return `${session.name}님의 이야기`;
  }
  const user = `[정체성] ${identityTitle || "—"}
[비전 한 줄] ${session.visionLine || "—"}

매거진 STORY 표지 헤드라인을 한 줄로 만들어주세요.
- 18자 이내, 시적이지만 구체적
- 따옴표 없이 한 줄만 출력`;
  const r = await ask(user, 100);
  return r.text.trim();
}
