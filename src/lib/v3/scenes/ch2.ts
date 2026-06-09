import { INTERVIEW_OWL_POOL, type SceneSpec } from "./types";
// RECEIVE_OPENERS — 2-9 followup B 분기에서 쓰던 opener 풀. 해당 씬이 2-magazine
// 통합으로 흡수되며 주석 처리되어 import도 같이 비활성. 분리 흐름 복원 시 함께
// 언커뮤트.
// import { RECEIVE_OPENERS } from "./openers";

export const CH2_SCENES: SceneSpec[] = [
  {
    id: "2-card",
    chapter: 2,
    kind: "chapterCard",
    timeOfDay: "starsRising",
    bgm: "benkirb-shine-10-268906.mp3",
    next: "2-0",
  },
  {
    id: "2-0",
    chapter: 2,
    kind: "ambience",
    owl: "contemplating",
    timeOfDay: "starsRising",
    narration: "편집장이 매거진의 새 페이지를 펼친다. 펜 끝이 종이 위에 가만히 머문다.",
    lines: [
      "창밖의 세상은 어둠에 잠겼지만,",
      "오히려 그렇기에 — 시야를 안으로 돌리기 가장 좋은 시간이에요.",
      "{name}님이 들려주신 두 이야기, 정말 흥미로웠어요.",
      "이번엔 조금 다른 각도로 볼게요. 과거를 지나 현재에서 — {name}님은 어떤 사람일지.",
      "먼저 {name}님이 평소에 어떤 가치를 중시하는지 궁금해요.",
    ],
    next: "2-3",
  },
  {
    id: "2-3",
    chapter: 2,
    kind: "owlNarration",
    timeOfDay: "starsRising",
    owl: "explaining",
    lines: [
      "우리는 같은 일을 하더라도 무게를 두는 곳이 다르거든요.",
      "어떤 사람은 결과를 위해 일하고, 어떤 사람은 관계를 위해 일하고,",
      "어떤 사람은 그냥 — 그게 옳다고 믿기 때문에 일해요.",
      "{name}님이 삶을 살아가거나, 일을 하는데 있어 가장 중시하는 가치는 무엇인가요?",
      "여러 단어들을 함께 살펴보면서 찾아볼게요.",
    ],
    next: "2-3-1",
  },
  {
    id: "2-3-1",
    chapter: 2,
    kind: "owlNarration",
    timeOfDay: "starsRising",
    hideOwl: true,
    hideSpeakerLabel: true,
    narration: "편집장이 펜을 내려놓고 가치 카드를 꺼낸다.",
    next: "2-4",
  },
  {
    id: "2-4",
    chapter: 2,
    kind: "valueCards",
    timeOfDay: "starsRising",
    bgImage: "/vision_express/common/Chapter02-1.jpg",
    owl: "listening",
    hideSpeakerLabel: true,
    // bgm 제거 — ch2 기본값(기차 소리)이 그대로 깔리도록
    // narration("카드들이 펼쳐진다") 제거 — 무대 지시문이라 카드 화면에 또 띄울
    // 필요 없음 (2-3-1에서 이미 카드 꺼내는 내레이션 건넴).
    lines: [
      "마음에 닿는 단어 3개를 골라주세요.",
      "여기 없다면 직접 적어 주셔도 좋습니다.",
    ],
    buttonLabel: "건네기",
    next: "2-5",
  },
  {
    id: "2-5",
    chapter: 2,
    kind: "valueDefSingle",
    timeOfDay: "starsRising",
    owl: "focusedWriting",
    owlPool: INTERVIEW_OWL_POOL,
    // bgm 제거 — ch2 기본값(기차 소리)이 그대로 깔리도록
    narration: "편집장이 선택된 카드들을 나란히 펼쳐놓는다.",
    lines: [
      "{selectedCount}가지의 단어를 선택해주셨네요. 좋습니다.",
      "음… 같은 단어여도 사람마다 그 의미가 조금씩 다른데요. 고르신 단어들은 {name}님에게는 어떤 의미인가요?",
      "사전적 정의가 아니어도 좋아요. {name}님이 느끼는 그 단어의 의미를 적어주세요.",
    ],
    buttonLabel: "건네기",
    next: "2-5b",
  },
  {
    id: "2-5b",
    chapter: 2,
    kind: "valueReflection",
    timeOfDay: "starsRising",
    owl: "contemplating",
    narration: "편집장이 적힌 의미들을 가만히 들여다본다.",
    next: "2-6",
  },
  {
    id: "2-6",
    chapter: 2,
    kind: "question",
    timeOfDay: "starsRising",
    owl: "explaining",
    narration: "편집장이 고개를 끄덕이며 펜을 든다.",
    pageSize: 1,
    lines: [
      "잘 들었어요. 그럼 이번엔 바깥에서 한번 볼게요.",
      "{name}님 주변에서 — 동료든, 후배든, 가까운 누군가든 — {name}님에게 도움을 요청했던 순간이 있었을 거예요.",
      "최근 1년 안에, 누군가 {name}님을 찾아왔던 일이 있다면 — 어떤 일로 왔나요? 한두 가지면 충분해요.",
    ],
    editorNote: "작은 부탁일수록 좋아요. 작은 부탁일수록 그 사람이 진짜 믿는 것을 보여주거든요. 예를 들면 — \"옆 팀 후배가 발표자료 한 장만 봐달라며 슬쩍 들고 왔던 그날\", \"오랜 친구가 이직 면접 전에 전화로 마음을 한참 쏟아내던 새벽\" 같은 한 장면이면 충분해요.",
    saveTo: "helpRequests",
    buttonLabel: "건네기",
    next: "2-7-narr",
  },
  /*
  // ── [숨김] 2-7 강점 공통 결 LLM 반향(strengthConfirm).
  // 피드백: 4재료 wow 흐름에서 이 단독 반향 단계를 제거.
  // 복원하려면 위 2-6.next를 "2-7"로 되돌리고 아래 객체 주석 풀기.
  {
    // [21p] 강점 공통 결 LLM 반향. 2026-05-15: 확인 버튼 제거 — 클릭-진행으로 전환.
    id: "2-7",
    chapter: 2,
    kind: "strengthConfirm",
    timeOfDay: "starsRising",
    owl: "scrutinizing",
    next: "2-7-narr",
  },
  */
  {
    // [23p] 편집장이 펜을 내려놓는 비트.
    id: "2-7-narr",
    chapter: 2,
    kind: "ambience",
    timeOfDay: "starsRising",
    owl: "contemplating",
    narration: "편집장이 펜을 내려놓고 잠시 {name}님을 바라본다.",
    next: "2-7-others",
  },
  {
    // [24p] 타인이 보는 나.
    id: "2-7-others",
    chapter: 2,
    kind: "question",
    timeOfDay: "starsRising",
    owl: "listening",
    owlPool: INTERVIEW_OWL_POOL,
    lines: [
      "이제 마지막으로 —",
      "{name}님을 가장 가까이서 아는 사람이 \"이 사람은 ___한 사람이야\" 라고 말한다면, 어떤 말이 나올 것 같나요?",
    ],
    editorNote: "직장 동료, 멘토, 후배, 가족, 친구, 선생님… 누구든 괜찮아요. 한 분의 한마디를 그대로 옮겨주셔도 좋아요 — 예를 들면 \"같이 일하면 늘 차분한 사람\", \"막상 닥치면 끝까지 책임지는 사람\" 처럼요.",
    saveTo: "othersDescription",
    buttonLabel: "건네기",
    next: "2-7-nod",
  },
  {
    // [25p] 편집장이 고개를 끄덕이는 짧은 비트 — 매거진 펼치기 직전 호흡.
    // 편집자가 "해주신 이야기를 제가 정리해봤어요" 라고 건네며 2-10 매거진
    // spread로 이어진다. (이 lead는 2-10 spread 안이 아니라 이 전환 비트에서만.)
    id: "2-7-nod",
    chapter: 2,
    kind: "ambience",
    timeOfDay: "starsRising",
    owl: "noteHanding",
    narration: "편집장이 고개를 끄덕인다.",
    lines: ["해주신 이야기를 제가 정리해봤어요."],
    next: "2-10",
  },
  {
    // ── [신규 — 2026-05-19] Chapter 2 통합 매거진 페이지 (3 spread) ─────
    // 이전 ID였던 "2-magazine"을 사용자 요청대로 "2-10"으로 통일 (이전 2-10
    // ambience는 이미 주석 처리되어 ID 충돌 없음).
    //
    // 5개 씬(2-7-synth / 2-8 / 2-9 / 2-10 ambience / 2-11 recordPage)을
    // 한 화면으로 합친 "매거진 펼침". 카드 4장 + 정체성 입력 + judge + 도장이
    // 같은 페이지 안에서 흐름. judge 결과 D 또는 시도 3회 소진 시 페이지에
    // "Chapter 2 · 완성" 도장이 찍히고 다음 버튼 활성화.
    //
    // 카드 본문은 LLM(v3SynthesizeStrength)이 BEAT 4개 × ~120자로 채움.
    // 사용자 답변/judge/identityName 저장은 새 씬 컴포넌트가 직접 처리.
    //
    // next는 "2-12"(별 떠오름) — 기존 2-11(recordPage)은 backup으로 빠짐.
    id: "2-10",
    chapter: 2,
    kind: "chapter2Magazine",
    timeOfDay: "starsRising",
    owl: "focusedWriting",
    owlPool: INTERVIEW_OWL_POOL,
    buttonLabel: "이렇게 부를래요",
    next: "2-12",
  },
  {
    // ── [임시 — 디자인 비교용] Chapter 2 v1 백업 디자인 ──
    // 실제 flow에서는 도달하지 않음 (next로 가리키는 씬 없음).
    // URL ?scene=2-10-v1 로 직접 진입해서 새 디자인과 비교만 가능.
    // 비교 끝나면 이 객체 + SceneKind/SCENE_COMPONENTS 매핑 같이 제거.
    id: "2-10-v1",
    chapter: 2,
    kind: "chapter2MagazineV1",
    timeOfDay: "starsRising",
    owl: "focusedWriting",
    owlPool: INTERVIEW_OWL_POOL,
    buttonLabel: "이렇게 부를래요",
    next: "2-12",
  },
  /*
  // ── [숨김 — 2-magazine으로 통합됨] 4재료 종합 카드 단독 씬.
  // 복원: 위 2-7-nod.next를 "2-7-synth"로 되돌리고 아래 객체 주석 풀기.
  {
    id: "2-7-synth",
    chapter: 2,
    kind: "strengthSynthesis",
    timeOfDay: "starsRising",
    owl: "focusedWriting",
    next: "2-8",
  },
  */
  /*
  // ── [숨김] 평소 모습과 겹치는지 binaryChoice + 각 분기 반응.
  // 피드백: 4재료 wow 카드 요약 후 2-8 identity로 바로 이어지도록 제거.
  // 복원하려면 위 2-7-synth.next를 "2-7-align"로 되돌리고 아래 객체들 주석 풀기.
  {
    id: "2-7-align",
    chapter: 2,
    kind: "binaryChoice",
    timeOfDay: "starsRising",
    owl: "curious",
    lines: ["방금 함께 발견한 것 — {name}님이 평소 스스로 생각하는 강점과 얼마나 겹치나요?"],
    choices: [
      { label: "이미 알고 있었어요", next: "2-7-align-known", set: { selfStrengthAlignment: "known" } },
      { label: "새롭게 보였어요", next: "2-7-align-new", set: { selfStrengthAlignment: "new" } },
      { label: "반반이에요", next: "2-7-align-mixed", set: { selfStrengthAlignment: "mixed" } },
    ],
  },
  {
    id: "2-7-align-known",
    chapter: 2,
    kind: "owlNarration",
    timeOfDay: "starsRising",
    owl: "approving",
    lines: ["그렇군요. 알고 있었지만 — 이렇게 바깥에서 다시 확인되는 건 또 다른 느낌이지요."],
    next: "2-8",
  },
  {
    id: "2-7-align-new",
    chapter: 2,
    kind: "owlNarration",
    timeOfDay: "starsRising",
    owl: "explaining",
    lines: ["그 순간이 중요해요. 타인의 눈이 때로 우리가 보지 못한 것을 먼저 알아보거든요."],
    next: "2-8",
  },
  {
    id: "2-7-align-mixed",
    chapter: 2,
    kind: "owlNarration",
    timeOfDay: "starsRising",
    owl: "contemplating",
    lines: ["알고 있던 것이 더 선명해지고, 몰랐던 것이 조금 보이기 시작한 거네요."],
    next: "2-8",
  },
  */
  /*
  // ── [숨김 — 2-magazine 통합 씬으로 합쳐짐] 2026-05-19
  // 이름 입력(2-8) + judge 재질문(2-9) + 펜 ambience(2-10) 세 단계가 모두
  // 2-magazine 안의 하단 입력/judge/도장 흐름으로 흡수됨. 분리된 호흡으로
  // 되돌리고 싶으면 위 2-magazine 블록의 next를 "2-11"에서 "2-10" 또는 "2-8"로
  // 바꾸고 이 아래 객체들 주석을 풀면 됨.
  {
    id: "2-8",
    chapter: 2,
    kind: "question",
    timeOfDay: "starsRising",
    owl: "noteHanding",
    owlPool: INTERVIEW_OWL_POOL,
    lines: [
      "이제 {name}님의 차례예요.",
      "방금 함께 발견한 이 모습에 — {name}님만의 이름을 붙여주세요.",
      "한 단어여도 좋고, 한 문장이어도 좋아요.",
      "{name}님은 어떤 사람인가요?",
    ],
    inputHint: "정답이 없어요. {name}님이 느끼는 그 모습 그대로 적어주세요.\n예: '잇는 사람' / '흩어진 걸 하나로 모으는 사람'",
    reviewFields: [
      { label: "선택한 가치", field: "selectedValues" },
      { label: "주변에서 도움 요청 받은 일", field: "helpRequests" },
      { label: "엘 아울의 강점 반향", field: "valueReflection" },
      { label: "가까운 사람이 말한다면", field: "othersDescription" },
    ],
    saveTo: "identityName",
    buttonLabel: "이렇게 부를래요",
    next: "2-9",
  },
  {
    id: "2-9",
    chapter: 2,
    kind: "followup",
    timeOfDay: "starsRising",
    owl: "thinking",
    judge: "judgeBranch",
    parentSaveTo: "identityName",
    maxFollowups: 2,
    branches: {
      A: {
        narration: "편집장이 고개를 기울인다.",
        lines: [
          "조금 더 {name}님다운 표현을 찾아볼까요?",
          "방금 발견한 \"{strengthLinkedValue}\"{j:strengthLinkedValue:이/가} 들어간, {name}님만의 표현으로요.",
        ],
      },
      B: {
        narration: "편집장이 메모를 톡톡 두드린다.",
        openerPool: RECEIVE_OPENERS,
        lines: [
          "그런데 \"{identityTitle}\"{j:identityTitle:은/는} 세상에 많아요.",
          "{name}님만의 방식으로 — 그 표현이라면, 어떻게 부를 수 있을까요?",
        ],
      },
      D: {
        lines: [
          "그 이름을 듣고 나니 — Chapter 1에서 들려주신 두 장면이 다르게 읽혀요.",
          "그 이름이 그 장면들 안에 이미 있었던 것 같아요.",
          "이 이름은 오늘 STORY {name}호의 첫 페이지에 새겨질 거예요.",
        ],
        exhaustedLines: [
          "그 이름을 듣고 나니 — Chapter 1에서 들려주신 두 장면이 다르게 읽혀요.",
          "그 이름이 그 장면들 안에 이미 있었던 것 같아요.",
          "이 이름은 오늘 STORY {name}호의 첫 페이지에 새겨질 거예요.",
        ],
        next: "2-10",
      },
    },
    buttonLabel: "이렇게 부를래요",
  },
  {
    id: "2-10",
    chapter: 2,
    kind: "ambience",
    timeOfDay: "starsRising",
    owl: "focusedWriting",
    owlPool: INTERVIEW_OWL_POOL,
    narration: "편집장이 매거진의 첫 페이지에 천천히 적는다.",
    next: "2-11",
  },
  */
  {
    // ── [Backup — 2026-05-19] Ch2 단독 recordPage ─────────────────────
    // 2-10 합본 매거진(spread)이 Chapter 2 본문 + 정체성 입력을 모두 흡수하므로
    // 메인 흐름에서 빠짐. 단독 매거진 article 룩을 보고 싶을 때 URL 직접 진입.
    // 어느 씬도 next로 가리키지 않는 orphan — SCENES 등록은 유지(URL 접근).
    // 메인 흐름 복원: 위 2-10.next를 "2-11"로 되돌리기.
    id: "2-11",
    chapter: 2,
    kind: "recordPage",
    timeOfDay: "starsRising",
    owl: "writing",
    owlPool: INTERVIEW_OWL_POOL,
    hideOwl: true,
    hideSpeakerLabel: true,
    bgm: "writing-with-pen-loud.mp3",
    buttonLabel: "잘 읽었어요",
    next: "2-12",
  },
  {
    id: "2-12",
    chapter: 2,
    kind: "ambience",
    owl: "contemplating",
    // 내레이션이 "별이 하나둘 떠오르기 *시작*한다" 이므로 starsRising 으로
    // 통일. 별이 가득 차는 starsFull 분위기는 Ch3 진입(3-card)부터.
    timeOfDay: "starsRising",
    bgImage: "/vision_express/common/Chapter02-3.jpg",
    narration: "창밖에 별이 하나둘 떠오르기 시작한다. 편집장이 잠시 그 빛들을 바라본다.",
    lines: [
      "잠시 함께 바라볼까요.",
    ],
    next: "3-card",
  },
];
