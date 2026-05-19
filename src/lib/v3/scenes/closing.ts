import type { SceneSpec } from "./types";

export const CLOSING_SCENES: SceneSpec[] = [
  {
    id: "C-1",
    chapter: "C",
    kind: "ritual",
    owl: "noteHanding",
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.webp",
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
    bgImage: "/vision_express/common/morning-room.webp",
    lines: [
      "Magazine STORY · Vol. {name}",
      "한 호가 다 적혔어요. 곧 전해드릴게요.",
    ],
    buttonLabel: "고맙습니다",
    next: "C-3",
  },
  /*
  // ── [숨김] C-2b 매거진 포스터 — 사용자가 나중에 다시 살릴 수 있도록 보존.
  // 활성화하려면 다음 작업을 같이 되돌릴 것:
  //   1) 위 C-2의 next를 "C-2b"로 변경
  //   2) 아래 객체의 주석을 풀어 CLOSING_SCENES 배열에 다시 포함
  {
    id: "C-2b",
    chapter: "C",
    kind: "magazinePoster",
    owl: "handing",
    hideOwl: true,
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.webp",
    hideSpeakerLabel: true,
    next: "C-3",
  },
  */
  {
    id: "C-3",
    chapter: "C",
    kind: "owlNarration",
    owl: "laughing",
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/morning-room.webp",
    lines: [
      "그동안 {name}님의 이야기를 들려주셔서, 정말 고맙습니다.",
      "부디 빛나시기를.",
    ],
    next: "C-4",
  },
  {
    id: "C-4",
    chapter: "C",
    kind: "ritual",
    owl: "closingBook",
    hideOwl: true,
    hideSpeakerLabel: true,
    timeOfDay: "dawnFirstLight",
    bgImage: "/vision_express/common/arriving-train.webp",
    // 역 플랫폼 ambience (사람/새 소리). loop 가능 — ONE_SHOT_BGMS 아님.
    bgm: "freesound_community-train_station_outdoor_platform_birds_people-30576.mp3",
    narration: "비전 익스프레스가 종착역에 도착했습니다.",
    buttonLabel: "이제 내릴게요",
    // Self-loop sentinel — handled in V3App.handleAdvance as terminal reset
    // (clears session and returns to intro).
    next: "C-4",
  },
];
