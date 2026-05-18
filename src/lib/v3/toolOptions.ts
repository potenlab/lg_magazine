// src/lib/v3/toolOptions.ts
// The 8 "work tools" offered in Ch3 scene 3-7 (toolSelect), grouped into 4
// "힘" categories of 2 each. Both the "지금 잘 쓰는 도구" and "앞으로 키우고
// 싶은 도구" boxes share this same list.

export interface ToolOption {
  /** Stable id — not shown to the user, not stored in the session. */
  id: string;
  /** Shown as the option's bold label AND stored in the session. */
  label: string;
  /** Sub-text under the label. UI-only — not stored, not sent to the LLM. */
  description: string;
}

export interface ToolCategory {
  id: string;
  label: string;
  options: ToolOption[];
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "see",
    label: "보는 힘",
    options: [
      {
        id: "data-pattern",
        label: "데이터와 패턴으로",
        description: "숫자와 흐름을 읽어 남들이 못 보는 것을 먼저 발견하는 방식",
      },
      {
        id: "field-people",
        label: "현장과 사람으로",
        description: "직접 듣고 관찰해서 진짜 문제를 찾아내는 방식",
      },
    ],
  },
  {
    id: "make",
    label: "만드는 힘",
    options: [
      {
        id: "structure-design",
        label: "구조와 설계로",
        description: "복잡한 것을 정리하고 판을 짜는 방식",
      },
      {
        id: "language-content",
        label: "언어와 콘텐츠로",
        description: "글·말·영상으로 생각을 선명하게 만드는 방식",
      },
    ],
  },
  {
    id: "move",
    label: "움직이는 힘",
    options: [
      {
        id: "relationship-trust",
        label: "관계와 신뢰로",
        description: "사람을 잇고 함께 만들어가는 방식",
      },
      {
        id: "persuasion-influence",
        label: "설득과 영향력으로",
        description: "논리와 스토리로 사람을 움직이는 방식",
      },
    ],
  },
  {
    id: "execute",
    label: "실행하는 힘",
    options: [
      {
        id: "speed-completion",
        label: "속도와 완성으로",
        description: "빠르게 만들고 끝까지 해내는 방식",
      },
      {
        id: "experiment-validation",
        label: "실험과 검증으로",
        description: "작게 시도하고 배우며 방향을 잡는 방식",
      },
    ],
  },
];

export const ALL_TOOL_OPTIONS: ToolOption[] = TOOL_CATEGORIES.flatMap((c) => c.options);

if (ALL_TOOL_OPTIONS.length !== 8) {
  throw new Error(`Tool options must total 8 (4 categories × 2). Got ${ALL_TOOL_OPTIONS.length}.`);
}
