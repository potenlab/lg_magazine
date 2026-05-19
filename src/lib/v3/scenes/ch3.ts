import { INTERVIEW_OWL_POOL, type SceneSpec } from "./types";
import { RECEIVE_OPENERS, EMPATH_OPENERS } from "./openers";

// BG_NIGHT만 별 보는 풍경(Chapter03-1)을 유지하고, 나머지는 Chapter03 메인으로 통일.
const BG_NIGHT = "/vision_express/common/Chapter03-1.webp";
const BG_FOG = "/vision_express/common/Chapter03.webp";
const BG_ROOM = "/vision_express/common/Chapter03.webp";

export const CH3_SCENES: SceneSpec[] = [
  // ── 챕터 카드 ──────────────────────────────────────────────
  {
    id: "3-card",
    chapter: 3,
    kind: "chapterCard",
    timeOfDay: "starsFull",
    bgImage: BG_NIGHT,
    bgm: "benkirb-shine-10-268906.mp3",
    next: "3-0",
  },

  // ── [1-3p] 인트로 내레이션 ──────────────────────────────────
  {
    id: "3-0",
    chapter: 3,
    kind: "owlNarration",
    owl: "contemplating",
    timeOfDay: "starsFull",
    bgImage: BG_NIGHT,
    narration: "편집장이 창밖을 바라보다 천천히 고개를 돌린다.",
    lines: [
      "지금까지 잘 따라와 주셨어요.",
      "{name}님이 지나온 길과, 지금의 {name}님을 함께 들여다봤으니 —",
      "이제 아직 오지 않은 곳. 하지만 {name}님이 향하고 싶은 곳. 그곳을 함께 그려볼게요.",
    ],
    next: "3-1",
  },

  // ── [4p] 끌림 질문 ─────────────────────────────────────────
  {
    id: "3-1",
    chapter: 3,
    kind: "question",
    owl: "curious",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    lines: [
      "요즘 이유는 잘 모르겠지만 일하면서",
      "\"이런 걸 더 해보고 싶다\", \"이런 사람이 되고 싶다\"는 생각이 드는 게 있나요?",
    ],
    editorNote: "지금 당장 할 수 있는 일이 아니어도 괜찮아요. 막연한 감각이어도, 아직 이름 붙이기 어려운 것이어도 좋아요.",
    inputHint: "어떤 일인지, 어떤 장면인지 — 구체적일수록 좋아요.",
    saveTo: "attraction",
    buttonLabel: "건네기",
    next: "3-1b",
  },

  // ── [5p] 끌림 후속 ─────────────────────────────────────────
  {
    id: "3-1b",
    chapter: 3,
    kind: "followup",
    owl: "thinking",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    judge: "judgeBranch",
    parentSaveTo: "attraction",
    maxFollowups: 1,
    branches: {
      A: {
        openerPool: RECEIVE_OPENERS,
        lines: [
          "조금 더 구체적으로 — 어떤 일을 하고 있는 자신의 모습인지, 그려볼 수 있을까요?",
          "어떤 장면이 떠오르세요?",
        ],
        inputHint: "언제 어디서 무엇을 하고 있는 장면인지 그려주세요.",
      },
      D: { next: "3-2" },
    },
    buttonLabel: "건네기",
  },

  // ── [6p] 이미 하고 있는 것 ─────────────────────────────────
  {
    id: "3-2",
    chapter: 3,
    kind: "question",
    owl: "listening",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    lines: [
      "그런데 한 가지 여쭤볼게요.",
      "그 끌림 — 사실 지금 {name}님의 일상 어딘가에 이미 조금씩 있지 않나요?",
      "아주 작은 형태로라도, 이미 그쪽으로 움직이고 있는 게 있다면요.",
    ],
    editorNote: "없어도 괜찮아요. 있다면, 어떤 모습인지 궁금해서요.",
    inputHint: "일상에서 아주 작은 것이어도 좋아요.",
    saveTo: "alreadyDoing",
    buttonLabel: "건네기",
    next: "3-2b",
  },

  // ── [6b] 이미 하고 있는 것 후속 ───────────────────────────
  {
    id: "3-2b",
    chapter: 3,
    kind: "followup",
    owl: "thinking",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    judge: "judgeBranch",
    parentSaveTo: "alreadyDoing",
    maxFollowups: 1,
    branches: {
      A: {
        openerPool: EMPATH_OPENERS,
        lines: [
          "조금 더 구체적으로는요?",
          "어떤 상황에서 그걸 하고 계신 것 같으세요?",
        ],
        inputHint: "아주 작은 것 하나면 충분해요.",
      },
      D: { next: "3-3" },
    },
    buttonLabel: "건네기",
  },

  // ── [7p] 장애물 질문 ───────────────────────────────────────
  {
    id: "3-3",
    chapter: 3,
    kind: "question",
    owl: "serious",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    narration: "편집장이 펜을 내려놓고 잠시 {name}님을 바라본다.",
    lines: [
      "그 끌림을 따라가는 것 — 어딘가 걸리는 부분이 있을 것 같아요.",
      "지금의 {name}님에게 아직 어색하거나, 잘 안 된다고 느끼는 것,",
      "스스로 \"이 부분은 아직 나답지 않다\"고 느끼거나, 자꾸 시도하지 못하는 원인같은 것들이요.",
    ],
    editorNote: "{name}님이 느끼는 솔직한 장애물이 궁금해요.",
    inputHint: "솔직한 것일수록 더 도움이 돼요.",
    saveTo: "obstacles",
    buttonLabel: "건네기",
    next: "3-3b",
  },

  // ── [8p] 장애물 후속 (위로 메시지) ────────────────────────
  {
    id: "3-3b",
    chapter: 3,
    kind: "followup",
    owl: "thinking",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    judge: "judgeBranch",
    parentSaveTo: "obstacles",
    maxFollowups: 1,
    branches: {
      A: {
        openerPool: RECEIVE_OPENERS,
        lines: [
          "조금 더 구체적으로 말씀해 주세요.",
          "어떤 상황에서 막히거나, 어떤 생각이 드는지 — 있는 그대로 말씀해 주세요.",
        ],
        inputHint: "솔직하게 꺼내주실수록 좋아요.",
      },
      D: {
        lines: [
          "— 솔직하게 말해주셔서 감사해요.",
          "그 걸림돌이 있다는 걸 아는 것만으로도, 대단하신 거예요.",
          "대부분의 사람들은 이걸 잘 꺼내지 못하거든요.",
        ],
        next: "3-4",
      },
    },
    buttonLabel: "건네기",
  },

  // ── [9p] 진짜 이유 ─────────────────────────────────────────
  {
    id: "3-4",
    chapter: 3,
    kind: "question",
    owl: "listening",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    lines: [
      "그러면요.",
      "그럼에도 불구하고, 그쪽으로 향하고 싶은 진짜 이유가 있다면요?",
    ],
    editorNote: "거창하지 않아도 돼요.",
    inputHint: "솔직하게 들려주세요.",
    saveTo: "whyReason",
    buttonLabel: "건네기",
    next: "3-4b",
  },

  // ── [10p] 진짜 이유 후속 ──────────────────────────────────
  {
    id: "3-4b",
    chapter: 3,
    kind: "followup",
    owl: "thinking",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_FOG,
    narration: "편집장이 고개를 끄덕이며 창밖을 잠시 바라본다.",
    judge: "judgeBranch",
    parentSaveTo: "whyReason",
    maxFollowups: 1,
    branches: {
      A: {
        openerPool: EMPATH_OPENERS,
        lines: [
          "조금 더 가슴에서 나온다면 — 어떤 말일까요?",
          "거창하지 않아도 돼요. 솔직한 한 마디로요.",
        ],
        inputHint: "가장 솔직한 한 마디면 충분해요.",
      },
      D: {
        exhaustedLines: ["그 이유가 — {name}님을 그쪽으로 계속 당기고 있는 거군요."],
        next: "3-5",
      },
    },
    buttonLabel: "건네기",
  },

  // ── [11p] 전환 내레이션 ────────────────────────────────────
  {
    id: "3-5",
    chapter: 3,
    kind: "owlNarration",
    owl: "explaining",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    lines: [
      "끌리는 것도, 걸리는 것도, 그럼에도 향하고 싶은 이유도 — 이제 꽤 선명하게 보이기 시작했어요.",
      "그럼 이제 그 방향의 끝을 한번 그려볼게요.",
    ],
    next: "3-6",
  },

  // ── [12p] 전문성 결합 방식 선택 ────────────────────────────
  {
    id: "3-6",
    chapter: 3,
    kind: "cardChoice",
    owl: "noteHanding",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    lines: [
      "한 가지만 먼저 골라볼게요.",
      "{name}님이 성장하고 싶은 방향 — 어느 쪽이 더 끌리나요?",
    ],
    choices: [
      {
        label: "지금 전문성의 뿌리를 더 단단하게 내리는 방향",
        description: "예: 4년차 HR 담당자가 조직문화 설계의 전문가로 더 깊어지는 것",
        next: "3-7",
        set: { growthDirection: "전문성 심화" },
      },
      {
        label: "두 번째 전문성의 기둥을 세우는 방향",
        description: "예: 영업 담당자가 데이터 분석 역량을 새롭게 쌓아 두 개의 축을 갖는 것",
        next: "3-7",
        set: { growthDirection: "전문성 확장" },
      },
      {
        label: "가진 전문성들을 새로운 방식으로 잇는 방향",
        description: "예: 교육 기획과 UX 감각을 결합해 기존에 없던 학습 경험을 만드는 것",
        next: "3-7",
        set: { growthDirection: "전문성 연결" },
      },
    ],
  },

  // ── [13p] 도구 선택 — 지금 잘 쓰는 도구 / 키우고 싶은 도구 ──
  {
    id: "3-7",
    chapter: 3,
    kind: "toolSelect",
    owl: "noteHanding",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    lines: [
      "그리고 하나 더.",
      "{name}님이 성과를 만들 때 주로 쓰고 싶은 도구는 무엇인가요?",
    ],
    editorNote:
      "같은 도구를 골라도 괜찮아요. 지금 잘하는 것을 더 깊이 쓰고 싶다는 것도 하나의 방향이에요.",
    buttonLabel: "건네기",
    next: "3-8",
  },

  // ── [14p] 기여 질문 ────────────────────────────────────────
  {
    id: "3-8",
    chapter: 3,
    kind: "question",
    owl: "curious",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    lines: [
      "살아가면서 —",
      "{name}님이 세상에 어떤 기여를 하고 싶은지, 어떤 영향력을 펼치는 사람이 되고 싶은지 말해줄 수 있을까요?",
    ],
    editorNote: "거창하지 않아도 돼요. 언젠가 그렇게 되면 좋겠다는 감각이면 충분해요.",
    inputHint: "어떤 사람들에게, 어떤 방식으로 영향을 미치고 싶은지 떠오르는 대로요.",
    saveTo: "contribution",
    buttonLabel: "건네기",
    next: "3-8b",
  },

  // ── [14b] 기여 후속 ────────────────────────────────────────
  {
    id: "3-8b",
    chapter: 3,
    kind: "followup",
    owl: "thinking",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    judge: "judgeBranch",
    parentSaveTo: "contribution",
    maxFollowups: 1,
    branches: {
      A: {
        openerPool: RECEIVE_OPENERS,
        lines: [
          "조금 더 구체적으로 — 어떤 사람들에게, 어떤 방식으로 영향을 미치고 싶으세요?",
        ],
        inputHint: "어떤 사람들에게, 어떤 변화를 만들고 싶은지요.",
      },
      D: { next: "3-9" },
    },
    buttonLabel: "건네기",
  },

  // ── [15p] "방향들이 보여요" 내레이션 ──────────────────────
  {
    id: "3-9",
    chapter: 3,
    kind: "owlNarration",
    owl: "focusedWriting",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    narration: "편집장이 고개를 끄덕이며 펜을 든다.",
    lines: [
      "여기까지 들려주신 이야기들을 한자리에 모아보면 — 이런 방향들이 보여요.",
    ],
    next: "3-10",
  },

  // ── [17p] 성장 방향 선택 ──────────────────────────────────
  {
    // [ch3 wow] 매거진 5 카드 통합 반향. 기존 visionSelect(6옵션+textarea)를
    // 대체. 사용자 visionLine 입력 단계는 별도 scene으로 이후 추가 예정.
    id: "3-10",
    chapter: 3,
    kind: "growthVisionSynthesis",
    owl: "focusedWriting",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    next: "3-10c",
  },
  {
    // [신규] 매거진 카드 반향을 본 뒤 본인 언어로 성장 방향을 적는 단계.
    // 기존 visionSelect의 textarea 역할을 분리해서 가져왔다.
    id: "3-10c",
    chapter: 3,
    kind: "question",
    owl: "focusedWriting",
    owlPool: INTERVIEW_OWL_POOL,
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    lines: [
      "방금 함께 본 매거진을 참고해서 — {name}님은 어떤 방향으로 나아가고 싶은 사람인가요?",
      "한 문장으로 {name}님만의 언어로 적어주세요.",
    ],
    editorNote: "매거진 카드의 표현을 가져와도 좋고, 합치거나 다시 써도 좋아요.",
    inputHint: "{name}님은 ___한 사람",
    saveTo: "visionLine",
    buttonLabel: "이걸로 할게요",
    next: "3-11",
  },

  /*
  // ── [숨김] 3-10b 시간 지평 — visionLine 입력 단계가 함께 사라져서
  // (3-10이 매거진 카드로 바뀌며 textarea가 없어졌음) timeHorizon이 빈
  // visionLine 위에서 동작하던 문제를 피하기 위해 제거.
  // 복원하려면 위 3-10.next를 "3-10b"로 되돌리고 아래 객체 주석 풀기.
  {
    id: "3-10b",
    chapter: 3,
    kind: "timeHorizon",
    owl: "focusedWriting",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    buttonLabel: "이걸로 할게요",
    next: "3-11",
  },
  */

  // ── 비전 확인 내레이션 ─────────────────────────────────────
  {
    id: "3-11",
    chapter: 3,
    kind: "owlNarration",
    owl: "serious",
    pageSize: 1,
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    narration: "편집장이 선택한 방향 문장을 천천히 읽는다.",
    lines: [
      "{visionLine}",
      "— {name}님의 방향이 정해졌어요.",
      "이 페이지를 매거진에 정리해 적을게요.",
    ],
    next: "3-12",
  },

  // ── 챕터 기록 페이지 ───────────────────────────────────────
  {
    id: "3-12",
    chapter: 3,
    kind: "recordPage",
    timeOfDay: "starsFull",
    bgImage: BG_ROOM,
    owl: "writing",
    hideOwl: true,
    hideSpeakerLabel: true,
    buttonLabel: "잘 읽었어요",
    next: "3-13",
  },

  // ── 챕터 전환 앰비언스 ─────────────────────────────────────
  {
    id: "3-13",
    chapter: 3,
    kind: "ambience",
    owl: "contemplating",
    timeOfDay: "starsFull",
    bgImage: BG_NIGHT,
    narration: "열차가 긴 커브를 돈다.",
    lines: [
      "창밖으로 동이 트기 시작해요.",
      "곧 다음 역에 가까워지고 있어요.",
    ],
    next: "4-card",
  },
];
