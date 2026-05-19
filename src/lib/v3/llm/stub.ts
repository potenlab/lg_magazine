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
    // Deterministic fallback — produces 4 BEAT cards even when LLM is offline.
    // 각 BEAT 200~280자, 4~5 문장. 실 LLM(Claude Sonnet 4.5)이 같은 무게로
    // 채워주도록 프롬프트가 잡혀있고, stub도 그 호흡에 맞춰서 길이/구조 통일.
    // 각 BEAT는 도입을 다른 단어로 시작(C-③ 규칙), 평이한 정리체 회피(C-①).
    const ask = strengthCommonAsk?.trim() || "사람들의 막막함";
    const others = othersDescription?.trim();
    const othersQuote = others ? `"${others.slice(0, 36)}${others.length > 36 ? "…" : ""}"` : null;
    const value1 = selectedValues?.[0]?.word?.trim();
    const value2 = selectedValues?.[1]?.word?.trim();
    const valueQuote = [value1, value2].filter(Boolean).map((v) => `'${v}'`).join("과 ");

    const beat1 =
      `Chapter 1에서 들려준 두 장면을 가만히 포개어 보면, 어떤 일이든 자기 손과 시선으로 직접 다듬어 보는 결이 흐르고 있어요. ` +
      `장면 안의 인물·장소·소재는 달랐지만, 같은 손길이 두 이야기를 한 사람의 결로 묶고 있어요. ` +
      `결과를 좇기보다 과정의 결을 잡는 자세가 ${name}님 안에서 자연스럽게 작동하는 것처럼 보여요. ` +
      `그래서 두 경험은 서로 다른 일이 아니라, 같은 사람이 다른 자리에서 보여준 같은 손길로 읽혀요.`;
    const beat2 =
      `주변 사람들이 들고 온 건 공통적으로 — ${ask}에 가까운 결이었어요. ` +
      `그 일들이 두 몰입 순간 안의 손길과 겹쳐 보이는 건 우연이 아니에요. ` +
      `직무가 아니라 행위의 형(form)이 ${name}님의 결을 만들고, 그 결이 사람들의 부탁을 끌어당기는 자석이 되고 있는 셈이에요. ` +
      `밖에서 들어오는 일의 종류가 안의 결을 한 번 더 확인해 주는 자리예요.`;
    const beat3 = othersQuote
      ? `가까이서 본 사람은 ${othersQuote} 라고 말했어요. ` +
        `그 말은 ${name}님이 자기 자신에 대해 들려준 결과 같은 그림을 다른 각도에서 비추고 있어요. ` +
        `안에서 본 결과 밖에서 본 결이 같은 자리에서 만난다는 건 — 그 결이 흔들리지 않는 실체라는 뜻에 가까워요. ` +
        `타인의 시선이 비추는 거울 속에서 자기다움의 윤곽이 한 켜 더 선명해져요.`
      : `가까이서 본 누군가의 시선과 스스로 들려준 결은 같은 그림을 다른 각도에서 비추는 것처럼 닿아 있어요. ` +
        `안과 밖의 두 시선이 만나는 지점이 가장 선명해지고 있어요. ` +
        `그 지점이 ${name}님이라는 사람의 윤곽을 또렷이 그려내고 있어요. ` +
        `타인의 거울이 한 켜 더 자기다움의 결을 잡아주는 자리예요.`;
    const beat4 = valueQuote
      ? `${valueQuote}이라는 단어가 그 결을 조용히 떠받치고 있어요. ` +
        `가치는 행위의 이유가 되고, 그 이유가 ${name}님의 손길을 같은 방향으로 모으고 있는 듯해요. ` +
        `네 장면이 결국 하나의 인물로 수렴해 보이는 건 이 가치가 뿌리에서 같은 결을 길어 올리고 있기 때문이에요. ` +
        `이름이 다른 가치 단어들이 결국 한 사람의 결을 다른 각도로 부르고 있는 셈이에요.`
      : `고른 가치 단어들이 그 결을 조용히 떠받치고 있어요. ` +
        `가치는 행위의 이유가 되고, 그 이유가 손길을 같은 방향으로 모으고 있는 듯해요. ` +
        `네 장면이 결국 하나의 인물로 수렴해 보이는 건 이 가치들이 뿌리에서 같은 결을 길어 올리고 있기 때문이에요. ` +
        `다르게 부른 이름들이 결국 한 결을 가리키고 있어요.`;
    return { synthesis: [beat1, beat2, beat3, beat4].join("\n") };
  },

  async synthesizeGrowthVision({
    name,
    identityName,
    topValue,
    growthDirection,
    attraction,
    contribution,
    othersDescription,
  }) {
    // Always produce 5 beats so the magazine grid has a consistent shape
    // even when LLM/network failed and the session payload is sparse. Per-beat
    // text gracefully degrades to placeholder language when the relevant
    // session field is empty.
    const id = identityName?.trim() || "스스로의 길을 짓는 사람";
    const valueWord = topValue?.trim();
    const valuePhrase = valueWord ? `'${valueWord}'이라는 단어` : `${name}님이 고른 가치들`;
    const dir = growthDirection?.trim();
    const attr = attraction?.trim();
    const contr = contribution?.trim();
    const others = othersDescription?.trim();

    const beat1 = `${name}님이 들려준 두 몰입 순간에는 같은 결이 흐르고 있었어요. 어떤 일이든 ${name}님은 자기 손과 시선으로 직접 다듬어 보는 사람으로 읽혀요.`;
    const beat2 = `${valuePhrase}와 '${id}'라는 이름은 그 결을 다른 각도에서 받쳐 주고 있어요. 가치는 행위의 이유가 되고, 정체성은 행위의 모양이 되어가는 모습이 보여요.`;
    const beat3 = others
      ? `가까이서 본 사람의 말 — "${others}" — 은 ${name}님 자신이 본 모습과 닮은 듯, 또 한 켜 다른 각도를 비춰 줘요. 안과 밖이 만나는 지점이 ${name}님의 결을 더 또렷하게 만들고 있어요.`
      : `${name}님이 본 자신과 가까운 사람의 시선이 같은 결을 다른 각도로 비춰 주고 있어요. 안과 밖이 만나는 지점이 ${name}님을 더 또렷하게 만들고 있어요.`;
    const attrSnippet = attr ? `'${attr.slice(0, 24)}${attr.length > 24 ? "…" : ""}'` : "그 끌림";
    const dirSnippet = dir ? `'${dir}'` : "지금 잡고 있는 성장 축";
    const beat4 = `Chapter 3에서 ${name}님이 끌린다고 한 ${attrSnippet}, 그리고 ${dirSnippet}은 결국 하나의 길로 모이고 있어요. 이미 작은 발걸음들이 그쪽을 향하고 있다는 게 보여요.`;
    const contrSnippet = contr ? `'${contr.slice(0, 30)}${contr.length > 30 ? "…" : ""}'` : "${name}님이 닿고 싶은 끝";
    const beat5 = `그 길의 끝에는 ${name}님이 닿고 싶다고 말한 ${contr ? contrSnippet : "어떤 영향력"}이 놓여 있어요. 도구는 손에 익혀가면 되고, 방향은 이미 정해져 있는 느낌이에요.`;

    return { synthesis: [beat1, beat2, beat3, beat4, beat5].join("\n") };
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
      return `${session.name}님을 만났다. ${session.gender}는 LG에서 일하는 ${session.job || "한 사람"}이었다. ${session.gender}가 들려준 이야기는 화려하지 않았지만, 그 속에는 자기만의 결이 흐르고 있었다. 우리는 ${session.gender}의 이야기를 한 호의 매거진으로 담았다.`;
    }
    return `우리는 묵묵히 자기 빛을 쌓아온 한 사람을 만났다.\n\n${session.gender}의 이야기를 들으며, 우리는 ${session.gender}가 이미 자기만의 답을 가지고 있음을 깨달았다.\n\n이 한 호가 ${session.gender}의 다음 여정에 작은 등불이 되기를.`;
  },

  async writeCoverHeadline({ session }) {
    const identityTitle = extractIdentityTitle(session.identityName);
    return identityTitle ? `${identityTitle}, ${session.gender}의 4년` : `${session.name}님의 이야기`;
  },
};
