import type { SceneSpec } from "./types";

export const CLOSING_SCENES: SceneSpec[] = [
  {
    id: "C-1",
    chapter: "C",
    kind: "ritual",
    owl: "noteHanding",
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.jpg",
    // 도착 알림 딩동 효과음 (subway-station-chime)
    bgm: "freesound_community-subway-station-chime-100558.mp3",
    pageSize: 2,
    lines: [
      "열차가 곧 다음 역에 도착해요.",
      "여기서 {name}님은 내리시고, 저는 또 다른 분을 기다릴 거예요.",
      "인터뷰 내용은 제가 정리해서 STORY {name}호로 만들어드릴게요.",
      "이 호는 어디에도 팔리지 않아요.",
      "발행되지도 않습니다.",
      "오직 {name}님 한 분께만 전달돼요.",
    ],
    buttonLabel: "네, 감사해요",
    next: "C-2",
  },
  {
    id: "C-2",
    chapter: "C",
    kind: "magazineHandoff",
    owl: "handing",
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.jpg",
    lines: [
      "Magazine STORY · Vol. {name}",
      "한 호가 다 적혔어요. 곧 전해드릴게요.",
    ],
    buttonLabel: "고맙습니다",
    next: "C-2b",
  },
  {
    // ── [2026-05-19 재활성] 합본 매거진 스프레드 ──────────────────────
    // C-2(PDF handoff) 직후, 사용자가 화면에서 4 챕터 article을 좌·우 2면씩
    // 직접 읽어볼 수 있게 함. 마지막 spread는 Editor's Cards(가치/비전/...).
    // 새 디자인은 MagazinePosterScene.tsx, v1 백업은 MagazinePosterScene_v1.tsx.
    id: "C-2b",
    chapter: "C",
    kind: "magazinePoster",
    owl: "handing",
    hideOwl: true,
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.jpg",
    hideSpeakerLabel: true,
    buttonLabel: "이 호를 닫을게요",
    next: "C-3",
  },
  {
    // ── [임시 — 디자인 비교용] 기존 v1 디자인을 같은 흐름에서 비교 ──
    // 실제 flow에서는 도달하지 않음 (어디서도 next로 가리키지 않음).
    // URL ?scene=C-2b-v1 로 직접 진입해서 새 디자인과 비교만 가능.
    // 비교 끝나면 이 객체와 SceneKind/SCENE_COMPONENTS 매핑까지 같이 제거.
    id: "C-2b-v1",
    chapter: "C",
    kind: "magazinePosterV1",
    owl: "handing",
    hideOwl: true,
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.jpg",
    hideSpeakerLabel: true,
    next: "C-3",
  },
  {
    id: "C-3",
    chapter: "C",
    kind: "owlNarration",
    owl: "laughing",
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.jpg",
    lines: [
      "그동안 {name}님의 이야기를 들려주셔서, 정말 고맙습니다.",
      "부디 빛나시기를.",
    ],
    next: "C-5",
  },
  // ── [2026-06 제거] C-4 "이제 내릴게요" 종착역 페이지 ─────────────────
  // 매거진 완성 후 굳이 한 단계 더 추가할 필요가 없다는 피드백으로 흐름에서 제외.
  // C-3 → C-5 직결로 변경. 복원이 필요하면 아래 객체 주석을 풀고 C-3.next 도
  // "C-4" 로 되돌릴 것.
  // {
  //   id: "C-4",
  //   chapter: "C",
  //   kind: "ritual",
  //   owl: "closingBook",
  //   hideOwl: true,
  //   hideSpeakerLabel: true,
  //   timeOfDay: "dawnFirstLight",
  //   bgImage: "/vision_express/common/arriving-train.jpg",
  //   bgm: "freesound_community-train_station_outdoor_platform_birds_people-30576.mp3",
  //   narration: "비전 익스프레스가 종착역에 도착했습니다.",
  //   buttonLabel: "이제 내릴게요",
  //   next: "C-5",
  // },
  {
    // 종착역에서 내린 뒤 보여지는 마지막 안내 화면.
    // 세션을 초기화하지 않고, "내 매거진 다시보기" 버튼으로 C-2b(매거진 스프레드)로
    // 돌아갈 수 있게 한다. 사용자는 이후에도 C-2b → C-3 → C-5 루프를 자유롭게
    // 순환하며 자신의 답변/매거진을 다시 읽을 수 있다.
    id: "C-5",
    chapter: "C",
    kind: "ritual",
    owl: "closingBook",
    hideOwl: true,
    hideSpeakerLabel: true,
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/arriving-train.webp",
    narration: "{name}님의 매거진은 언제든 다시 펼쳐보실 수 있어요.",
    buttonLabel: "내 매거진 다시보기",
    next: "C-2b",
  },
];
