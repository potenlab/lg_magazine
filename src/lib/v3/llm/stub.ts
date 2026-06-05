import type { LLMContract } from "./contract";
import { judgeBranchHeuristic, ruleForScene } from "@/lib/v3/judging/heuristics";
import { josa } from "@/lib/v3/scenes/josa";
import { extractIdentityTitle } from "@/lib/v3/scenes/template";

function firstSentence(s: string): string {
  const m = s.split(/[.!?。]/)[0]?.trim();
  return m && m.length > 3 ? m : s.trim();
}

function extractNoun(s: string): string {
  const m = s.match(/[가-힣]{2,5}/g);
  return m?.[m.length - 1] || "그 일";
}

// 사용자 답변을 안전하게 인용하는 형식. "~이었군요" 같이 어미를 임의로
// 붙여서 비문(예: "처음이라서이었군요")이 발생하는 것을 막기 위해, 답변
// 자체를 따옴표로 묶고 별도 문장으로 풀어준다. 어떤 어미로 끝나든 안전.
function safeQuoteReflection(s: string): string {
  const first = firstSentence(s);
  const trimmed = first.replace(/[.。!?]+$/g, "").trim();
  const quoted = trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  return `'${quoted}' — 그 결을 잠시 머물러 듣고 있어요.\n\n그 안의 마음이 천천히 떠오르는 것 같아요.`;
}

export const stubLLM: LLMContract = {
  async judgeBranch({ sceneId, answer }) {
    return judgeBranchHeuristic(ruleForScene(sceneId), answer);
  },

  async reflectShort({ answer }) {
    // Stub fallback. 이전엔 "{answer}이었군요"로 직접 어미를 붙였는데, 답변이
    // 어떤 어미로 끝나든 비문이 될 수 있어서 안전한 인용 형식으로 변경.
    return safeQuoteReflection(answer);
  },

  async rephraseLight({ answer }) {
    // Stub fallback: just return the original answer untouched. The real LLM
    // does the actual rephrasing; this preserves meaning when the LLM is offline.
    return answer.trim();
  },

  async comfortReassure({ name }) {
    // LLM 호출 실패 시 stub fallback. extractNoun이 "처음이라서" 같은
    // 어구를 그대로 가져와 조사가 비문법적으로 붙는 문제(예: "처음이라서이")가
    // 있어서, 안전한 명사형 표현으로 고정.
    return `아, ${name}님 마음 한구석에 그런 결이 있으셨군요.\n\n괜찮아요 — 이 열차에 함께하는 동안 그 마음은 천천히 가라앉을 거예요.`;
  },

  async reflectPoetic({ name, storyA, storyB }) {
    const a = extractNoun(storyA);
    const b = extractNoun(storyB);
    return `${a}와 ${b} 사이에서, 막막한 상황을 직접 움직이며 배워가는 결이 흐르는 것 같아요.`;
  },

  async reflectValues({ name, values }) {
    if (values.length === 0) return `${name}님 안에는 단단한 결이 흐르고 있어요.`;
    const words = values.map((v) => v.word);
    const joined =
      words.length === 1
        ? words[0]
        : `${words.slice(0, -1).join(", ")}${words.length > 2 ? "," : ""} 그리고 ${words[words.length - 1]}`;
    return `${joined}을(를) 함께 품고 일할 때 가장 힘이 나는 사람이시군요.`;
  },

  async reflectStrength({ helpRequests, values }) {
    const noun = extractNoun(helpRequests);
    return {
      commonAsk: `${noun}을 다듬는 일`,
      linkedValue: values[0]?.word ?? "",
    };
  },

  async synthesizeStrength({ name, strengthCommonAsk, othersDescription, selectedValues }) {
    // Deterministic fallback — produces 4 headlined BEAT cards when LLM offline.
    // Format mirrors real LLM output: "[HEADLINE: ...] body\n[HEADLINE: ...] body..."
    // 톤: 엘아울의 ~어요체 (~인 것 같아요 / ~네요 / ~이에요). 단정 ~입니다체 회피.
    // 추상 표현(결/수렴/행위의 형) 금지. **bold** 강조 1~2회.
    const askPhrase = strengthCommonAsk?.trim() || "어떻게 풀어야 할지 모르는 막막함";
    const others = othersDescription?.trim();
    const othersQuote = others ? `"${others.slice(0, 32)}${others.length > 32 ? "…" : ""}"` : null;
    const value1 = selectedValues?.[0]?.word?.trim();
    const value2 = selectedValues?.[1]?.word?.trim();
    const valueList = [value1, value2].filter(Boolean).map((v) => `'${v}'`).join(", ");
    const namePrefix = name ? `${name}님` : "당신";

    const beat1 =
      `[HEADLINE: 직접 판을 짜고 결과를 만드는 사람] ` +
      `${namePrefix}이 들려준 두 장면은 장소도 상황도 달랐지만, 행동의 패턴은 정확히 같았어요. ` +
      `남이 닦아놓은 길을 따라가는 대신 **직접 경로를 설계하고, 그 위에서 끝내 성과를 만들어내는 것**. ` +
      `${namePrefix}은 어떤 자리에서도 자기 손으로 직접 판을 짜야 직성이 풀리는 사람인 것 같아요. ` +
      `이 행동 방식이 두 이야기를 한 사람의 정체성으로 묶어주고 있는 것 같아요.`;

    const beat2 =
      `[HEADLINE: 막막함을 풀어내는 자석] ` +
      `주변 사람들이 유독 ${namePrefix}을 찾아온 이유를 보면, 그들이 가져온 일은 늘 ${askPhrase}이었어요. ` +
      `직함이 무엇이든, ${namePrefix}의 존재 자체가 **막막함을 풀어내는 자석**이 되어 사람들을 끌어당기고 있는 것 같아요. ` +
      `${namePrefix}이 들려준 두 장면에서도 같은 자세가 흘러나왔다는 건 우연이 아닌 것 같아요. ` +
      `이건 직업이 아니라 정체성의 영역에서 작동하는 힘인 것 같아요.`;

    const beat3 = othersQuote
      ? `[HEADLINE: 안과 밖이 같은 곳을 가리킬 때] ` +
        `가까운 누군가는 ${namePrefix}을 두고 ${othersQuote} 라고 말했어요. ` +
        `밖에서 보는 시선과 안에서 ${namePrefix}이 스스로 들려준 모습이 정확히 한 지점에서 만나네요. ` +
        `이 일치는 단순한 우연이 아니라, **흔들리지 않는 정체성의 증거**인 것 같아요. ` +
        `${namePrefix}의 모습은 보는 사람마다 다르게 해석되지 않는 명확한 윤곽을 가지고 있는 것 같아요.`
      : `[HEADLINE: 안에서 밖으로 일관된 사람] ` +
        `${namePrefix}이 스스로에 대해 들려준 이야기는, 가까운 사람들의 시선 속 모습과 정확히 같은 곳을 가리키는 것 같아요. ` +
        `이 일치는 **${namePrefix}의 정체성이 흔들리지 않는다는 가장 강력한 증거**인 것 같아요. ` +
        `밖에서도, 안에서도, 같은 사람으로 살아가고 계시다는 뜻이네요. ` +
        `이런 일관성이 신뢰의 토대가 되는 것 같아요.`;

    const beat4 = valueList
      ? `[HEADLINE: ${namePrefix}을 움직이는 단단한 축] ` +
        `오늘 ${namePrefix}이 고른 ${valueList}이라는 단어들은 단순한 가치 카드가 아닌 것 같아요. ` +
        `${namePrefix}이 왜 그토록 직접 판을 짜려 했는지, 왜 다른 사람의 막막함 앞에서 발을 떼지 않았는지를 설명해주는 **행동의 이유**인 것 같아요. ` +
        `이 가치들이 든든한 주춧돌이 되어주니, ${namePrefix}의 여정은 거친 파도를 만나도 흔들리지 않을 거예요. ` +
        `매거진 네 페이지는 결국 한 사람의 이야기로 모여요.`
      : `[HEADLINE: ${namePrefix}의 행동 뒤에 자리한 이유] ` +
        `${namePrefix}이 고른 가치 카드들은 단순한 단어가 아니라 **${namePrefix}이 매 순간 그렇게 살아온 이유**인 것 같아요. ` +
        `이 가치들이 든든한 주춧돌이 되어주니, ${namePrefix}의 여정은 거친 파도를 만나도 흔들리지 않을 거예요. ` +
        `매거진 네 페이지는 결국 한 사람의 이야기로 모여요.`;

    return { synthesis: [beat1, beat2, beat3, beat4].join("\n") };
  },

  async synthesizeGrowthVision({
    name,
    identityName,
    topValue,
    growthDirection,
    attraction,
    alreadyDoing,
    obstacles,
    whyReason,
    currentTool,
    growthTool,
    contribution,
  }) {
    // ── [2026-05-20] Ch3-focused 4 BEAT (Gem 6→4 merge 전략) ──────────
    // Ch3 응답 6개(attraction/whyReason/alreadyDoing/obstacles/contribution +
    // 객관식 growthDirection·currentTool·growthTool)를 4 BEAT에 압축.
    // 객관식은 standalone이 아니라 관련 텍스트 BEAT 안에 인젝션.
    // Ch1·Ch2는 BEAT 본문 주재료로 쓰지 않고 echo 한 줄 정도만.
    const namePrefix = name ? `${name}님` : "당신";
    const attr = attraction?.trim();
    const why = whyReason?.trim();
    const dir = growthDirection?.trim();
    const doing = alreadyDoing?.trim();
    const obs = obstacles?.trim();
    const contr = contribution?.trim();
    const id = identityName?.trim();
    const top = topValue?.trim();
    const curTools = (currentTool ?? []).filter(Boolean);
    const growTools = (growthTool ?? []).filter(Boolean);

    // 짧은 snippet 만드는 헬퍼.
    const snip = (s: string | undefined, n: number) =>
      s ? (s.length > n ? `${s.slice(0, n)}…` : s) : "";

    // BEAT 1 — 내면의 부름 : attraction + whyReason + growthDirection
    const attrSnippet = attr ? `'${snip(attr, 28)}'` : `${namePrefix}의 끌림`;
    const whySnippet = why ? snip(why, 50) : "그 길로 끌리는 이유";
    const dirInject = dir
      ? `${namePrefix}이 고른 다음 역의 방향은 '${dir}'을 향하고 있는 것 같아요.`
      : `${namePrefix}이 고른 다음 역의 방향이 이미 그쪽을 가리키고 있는 것 같아요.`;
    const beat1 =
      `[HEADLINE: 열망이 이미 가리키는 방향] ` +
      `${namePrefix}이 지금 마음에 품고 있는 건 ${attrSnippet}이에요. ` +
      `${whySnippet}이 그 끌림의 뿌리이고, 단순한 호기심이 아니라 **이미 안에서 자라난 부름**인 것 같아요. ` +
      `${dirInject} ` +
      `열망과 방향이 한 곳에서 만난다는 건, 이미 다음 페이지가 펼쳐지기 시작했다는 신호인 것 같아요.`;

    // BEAT 2 — 이미 시작된 움직임 : alreadyDoing + currentTool
    const doingSnippet = doing ? snip(doing, 60) : "이미 행동으로 옮기고 있는 작은 시도들";
    const curInject = curTools.length >= 2
      ? `이 움직임을 떠받치는 도구는 이미 ${namePrefix} 손에 익은 '${curTools[0]}'·'${curTools[1]}'인 것 같아요.`
      : curTools.length === 1
        ? `이 움직임을 떠받치는 도구는 이미 ${namePrefix} 손에 익은 '${curTools[0]}'인 것 같아요.`
        : `이 움직임을 떠받치는 도구가 이미 ${namePrefix}의 손에 익어 있는 것 같아요.`;
    const beat2 =
      `[HEADLINE: 이미 시작된 항해] ` +
      `${namePrefix}은 말로만 그치지 않고 이미 ${doingSnippet}을 하고 계시네요. ` +
      `생각하는 사람과 움직이는 사람의 차이는 한 끗인데, ${namePrefix}은 **이미 움직이는 쪽**에 서 계신 것 같아요. ` +
      `${curInject} ` +
      `남이 시작해 주기를 기다리지 않는 사람의 모습이 이 페이지에 그려져요.`;

    // BEAT 3 — 안개를 걷어낼 도구 : obstacles + growthTool
    const obsSnippet = obs ? snip(obs, 50) : `${namePrefix}을 머뭇거리게 하는 그 안개`;
    const growInject = growTools.length >= 2
      ? `이 안개를 걷어낼 무기로 ${namePrefix}이 본능적으로 고른 건 '${growTools[0]}'·'${growTools[1]}'인 것 같아요.`
      : growTools.length === 1
        ? `이 안개를 걷어낼 무기로 ${namePrefix}이 본능적으로 고른 건 '${growTools[0]}'인 것 같아요.`
        : `이 안개를 걷어낼 무기를 ${namePrefix}은 이미 알고 계신 것 같아요.`;
    const beat3 =
      `[HEADLINE: 안개를 걷어낼 한 자루의 무기] ` +
      `${namePrefix}을 멈춰 세우는 건 ${obsSnippet}인 것 같아요. ` +
      `이 안개는 외부에서 온 게 아니라, 한 단계 더 나아가려는 사람만이 마주하는 안개네요. ` +
      `${growInject} ` +
      `이 무기를 손에 쥐었을 때, **안개는 걷히고 그 너머의 풍경이 열릴 거예요**.`;

    // BEAT 4 — 종착지의 풍경 : contribution + (Ch2 echo)
    const contrSnippet = contr ? `'${snip(contr, 36)}'` : `${namePrefix}이 남기고 싶다고 말한 영향력`;
    const echoCh2 = id && top
      ? `${namePrefix}을 움직이는 '${top}'이 이 종착지의 이유이고, '${id}'이라는 정체성이 이 풍경의 주인공인 것 같아요. `
      : id
        ? `'${id}'이라는 정체성이 이 풍경의 주인공인 것 같아요. `
        : top
          ? `${namePrefix}을 움직이는 '${top}'이 이 종착지의 이유인 것 같아요. `
          : "";
    const beat4 =
      `[HEADLINE: ${namePrefix}이 남기고 싶은 풍경] ` +
      `${namePrefix}이 닿고 싶다고 말한 풍경은 ${contrSnippet}이에요. ` +
      `이건 단순한 목표가 아니라 **${namePrefix}이 살아 있었음을 증명할 유산**의 모습인 것 같아요. ` +
      `${echoCh2}` +
      `매거진 세 페이지의 끌림과 움직임과 도구는 모두 이 풍경으로 모여요. ${namePrefix}의 항해는 이미 출발했고, 종착지가 이미 보이네요.`;

    return { synthesis: [beat1, beat2, beat3, beat4].join("\n") };
  },

  async generateVisionDirections() {
    // Fixed fallback — used when the LLM call / parse fails. Mirrors
    // FALLBACK_DIRECTIONS in VisionSelectScene so both layers show the same 6.
    return {
      directions: [
        "지금 하는 일의 본질을 더 깊이 파고드는 사람",
        "나만의 방식으로 같은 일을 다르게 해내는 사람",
        "이미 가진 강점을 더 선명하게 쓰는 사람",
        "새로운 영역으로 발을 넓혀가는 사람",
        "내가 중요하다고 믿는 곳에 실질적인 변화를 만드는 사람",
        "지금 하는 일을 통해, 언젠가 내가 닿고 싶은 곳에 가는 사람",
      ],
    };
  },

  async generateTimeHorizon() {
    // Fixed fallback — mirrors FALLBACK_HORIZON in TimeHorizonScene.
    return {
      horizon: [
        "1년 안에, 지금 하고 싶은 것을 한 발짝 더 실행해보는 사람",
        "3년 후에, 내가 원하는 방향으로 실질적으로 이동해 있는 사람",
        "언젠가, 내 방식으로 세상에 닿는 일을 하고 있는 사람",
      ],
    };
  },

  async extractKeyword({ answer, rule }) {
    const noun = extractNoun(answer);
    if (rule === "flow") return `${noun}에 빠져드는`;
    if (rule === "common") return `${noun}을 다루는`;
    return `${noun}을 향하는`;
  },

  async observePattern({ name, selectedValue }) {
    return {
      situationPattern: `${name}님은 새로운 무언가를 만들어야 하는 자리`,
      behaviorPattern: `${selectedValue}${josa(selectedValue, "을/를")} 향해 스스로 길을 내실 때`,
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async writeChapterArticle({ name, gender, chapter, session }) {
    const pron = gender;
    if (chapter === 1) {
      return {
        headline: `${pron}가 가장 ${pron}다웠던 두 순간`,
        body:
          `${pron}가 들려준 두 이야기는 화려하지 않았다.\n\n` +
          `첫 번째 장면에서 ${pron}는 "${firstSentence(session.flowExperience1)}"고 회상했다.\n` +
          `두 번째 장면에서 ${pron}는 "${firstSentence(session.flowExperience2)}"고 말했다.\n\n` +
          `편집장은 두 페이지를 나란히 놓고 한 문장을 적어 내려갔다 — ${session.ch1PoeticMirror || "두 이야기 사이에 같은 결이 흐르고 있었다."}.`,
        pullQuote: session.ch1PoeticMirror || firstSentence(session.flowExperience1),
      };
    }
    if (chapter === 2) {
      const identityTitle = extractIdentityTitle(session.identityName);
      return {
        headline: `${identityTitle}${josa(identityTitle, "이라는/라는")} 이름`,
        body:
          `${pron}가 가장 소중히 여기는 가치는 ${session.topValue}${josa(session.topValue, "이다/다")}.\n` +
          `그러나 ${pron}가 말하는 ${session.topValue}${josa(session.topValue, "은/는")} 사전적 의미와는 결이 다르다.\n\n` +
          `"${session.valueDefinitions[session.topValue] || ""}"\n\n` +
          `${pron}가 그 단어를 발음할 때, 거기에는 ${pron}만의 무게가 있었다. ` +
          `그리고 ${pron}는 그 가치를 품고 살아가는 자기 자신에게 새로운 이름을 붙였다.`,
        pullQuote: identityTitle,
      };
    }
    if (chapter === 3) {
      return {
        headline: `4년 후, ${pron}가 그린 자신`,
        body:
          `${pron}에게 4년 후의 자신을 그려보라 청했을 때, ${pron}는 잠시 눈을 감았다.\n\n` +
          `${pron}가 그린 미래는 "${firstSentence(session.futureSelf)}"의 모습이었다. ` +
          `${firstSentence(session.futureDay)}.\n\n` +
          `그것은 어떤 거창한 성취도, 거대한 직책도 아니었다. ` +
          `그저 ${pron}가 ${session.topValue}${josa(session.topValue, "을/를")} 더 자유롭게 펼치며 살아가는 모습.\n\n` +
          `${pron}는 그 모습을 한 줄로 이렇게 적었다.`,
        pullQuote: session.visionLine,
      };
    }
    return {
      headline: `내일 아침, ${pron}가 디딜 한 걸음`,
      body:
        `인터뷰가 끝나갈 무렵, ${pron}는 내일 아침 출근해서 시작할 일을 적어 내려갔다.\n\n` +
        `그것은 — ${session.firstStep}.\n\n` +
        `그리고 그 길을 혼자 가지 않을 것이라 했다. ` +
        `곁에는 ${session.supportPerson}${josa(session.supportPerson, "이/가")} 있고, 손에는 ${session.neededResource}${josa(session.neededResource, "이/가")} 함께할 것이다.\n\n` +
        `${pron}가 만들어갈 다음 호를 기대해보자.`,
      pullQuote: null,
    };
  },

  async writeEditorNote({ session, kind }) {
    if (kind === "intro") {
      return `${session.name}님을 만났다. ${session.gender}는 ${session.job ? `${session.job} 일을 하는 사람이었다` : "묵묵히 자기 자리를 지키는 한 사람이었다"}. ${session.gender}가 들려준 이야기는 화려하지 않았지만, 그 속에는 자기만의 결이 흐르고 있었다. 우리는 ${session.gender}의 이야기를 한 호의 매거진으로 담았다.`;
    }
    return `우리는 묵묵히 자기 빛을 쌓아온 한 사람을 만났다.\n\n${session.gender}의 이야기를 들으며, 우리는 ${session.gender}가 이미 자기만의 답을 가지고 있음을 깨달았다.\n\n이 한 호가 ${session.gender}의 다음 여정에 작은 등불이 되기를.`;
  },

  async writeCoverHeadline({ session }) {
    const identityTitle = extractIdentityTitle(session.identityName);
    return identityTitle ? `${identityTitle}, ${session.gender}의 4년` : `${session.name}님의 이야기`;
  },
};
