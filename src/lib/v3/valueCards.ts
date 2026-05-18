// src/lib/v3/valueCards.ts

export interface ValueCardCategory {
  id: string;
  label: string;
  /** Short English label shown on the dark menu-board card grid. */
  enLabel: string;
  emoji: string;
  /** Accent color used in the section header bar — distinguishes categories
   * without putting a colored chip on every individual card. */
  accent: string;
  cards: string[];
}

export const VALUE_CARD_CATEGORIES: ValueCardCategory[] = [
  { id: "growth",       label: "성장·도전",   enLabel: "Growth",    emoji: "🌱", accent: "#6b8e4e", cards: ["성장", "도전", "탁월함", "배움", "호기심"] },
  { id: "relation",     label: "관계·연결",   enLabel: "Relation",  emoji: "🤝", accent: "#c89b3c", cards: ["신뢰", "공감", "협력", "진정성", "소속감"] },
  { id: "freedom",      label: "자유·주도",   enLabel: "Freedom",   emoji: "🦋", accent: "#a06a8c", cards: ["자율", "주도성", "독립", "창의", "유연함"] },
  { id: "contribution", label: "기여·의미",   enLabel: "Contrib",   emoji: "🌟", accent: "#d4a017", cards: ["기여", "영향력", "의미", "사명", "인정"] },
  { id: "stability",    label: "안정·균형",   enLabel: "Stability", emoji: "🌳", accent: "#4f8b6b", cards: ["안정", "조화", "균형", "평온", "건강"] },
  { id: "joy",          label: "즐거움·표현", enLabel: "Joy",       emoji: "🎨", accent: "#c97c7c", cards: ["즐거움", "몰입", "표현", "아름다움", "자유로움"] },
];

/** Korean → English mapping for the menu-board card face. Kept as a flat
 * lookup (rather than restructuring `cards` to objects) so existing consumers
 * that read `cards: string[]` continue to work unchanged. */
export const VALUE_CARD_EN: Record<string, string> = {
  // growth
  "성장": "Growth",      "도전": "Challenge",   "탁월함": "Excellence",
  "배움": "Learning",    "호기심": "Curiosity",
  // relation
  "신뢰": "Trust",       "공감": "Empathy",     "협력": "Cooperation",
  "진정성": "Authenticity", "소속감": "Belonging",
  // freedom
  "자율": "Autonomy",    "주도성": "Proactivity", "독립": "Independence",
  "창의": "Creativity",  "유연함": "Flexibility",
  // contribution
  "기여": "Contribution","영향력": "Influence", "의미": "Meaning",
  "사명": "Mission",     "인정": "Recognition",
  // stability
  "안정": "Stability",   "조화": "Harmony",     "균형": "Balance",
  "평온": "Tranquility", "건강": "Health",
  // joy
  "즐거움": "Joyful",    "몰입": "Immersion",   "표현": "Expression",
  "아름다움": "Beauty",  "자유로움": "Freedom",
};

export const ALL_VALUE_CARDS: string[] =
  VALUE_CARD_CATEGORIES.flatMap((c) => c.cards);

if (ALL_VALUE_CARDS.length !== 30) {
  throw new Error(
    `Value cards must total 30 (6 categories × 5). Got ${ALL_VALUE_CARDS.length}.`,
  );
}
