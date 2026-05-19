import type { ComponentType } from "react";
import type { SceneKind, SceneSpec, SceneId } from "@/lib/v3/scenes/types";
import { IntroScene } from "./IntroScene";
import { ChapterCardScene } from "./ChapterCardScene";
import { OwlNarrationScene } from "./OwlNarrationScene";
import { RitualScene } from "./RitualScene";
import { BinaryChoiceScene } from "./BinaryChoiceScene";
import { OwlReflectScene } from "./OwlReflectScene";
import { QuestionScene } from "./QuestionScene";
import { FollowupScene } from "./FollowupScene";
import { ValueQuestionScene } from "./ValueQuestionScene";
import { ValueCardScene } from "./ValueCardScene";
import { ValueDefScene } from "./ValueDefScene";
import { ValueDefSingleScene } from "./ValueDefSingleScene";
import { ValueRankScene } from "./ValueRankScene";
import { PatternConfirmScene } from "./PatternConfirmScene";
import { Ch1KeywordScene } from "./Ch1KeywordScene";
import { ValueReflectionScene } from "./ValueReflectionScene";
import { StrengthConfirmScene } from "./StrengthConfirmScene";
import { StrengthSynthesisScene } from "./StrengthSynthesisScene";
import { GrowthVisionSynthesisScene } from "./GrowthVisionSynthesisScene";
import { CardChoiceScene } from "./CardChoiceScene";
import { ToolSelectScene } from "./ToolSelectScene";
import { VisionSelectScene } from "./VisionSelectScene";
import { TimeHorizonScene } from "./TimeHorizonScene";
import { RecordPageScene } from "./RecordPageScene";
import { AmbienceScene } from "./AmbienceScene";
import { MagazineHandoffScene } from "./MagazineHandoffScene";
import { MagazinePosterScene } from "./MagazinePosterScene";
import { EditorCreditsScene } from "./EditorCreditsScene";

interface SceneComponentProps {
  spec: SceneSpec;
  onAdvance: (next: SceneId) => void;
  onProgressVisibleChange?: (visible: boolean) => void;
  // Optional — only forwarded to scenes that render their own footer
  // (currently cardChoice + toolSelect) so they can include the 이전 button.
  onPrev?: () => void;
  canGoBack?: boolean;
}

export const SCENE_COMPONENTS: Record<SceneKind, ComponentType<SceneComponentProps>> = {
  intro: IntroScene,
  chapterCard: ChapterCardScene,
  owlNarration: OwlNarrationScene,
  ritual: RitualScene,
  binaryChoice: BinaryChoiceScene,
  owlReflect: OwlReflectScene,
  question: QuestionScene,
  followup: FollowupScene,
  valueQuestion: ValueQuestionScene,
  valueCards: ValueCardScene,
  valueDef: ValueDefScene,
  valueDefSingle: ValueDefSingleScene,
  valueRank: ValueRankScene,
  patternConfirm: PatternConfirmScene,
  ch1Keyword: Ch1KeywordScene,
  valueReflection: ValueReflectionScene,
  strengthConfirm: StrengthConfirmScene,
  strengthSynthesis: StrengthSynthesisScene,
  growthVisionSynthesis: GrowthVisionSynthesisScene,
  cardChoice: CardChoiceScene,
  toolSelect: ToolSelectScene,
  visionSelect: VisionSelectScene,
  timeHorizon: TimeHorizonScene,
  recordPage: RecordPageScene,
  ambience: AmbienceScene,
  magazineHandoff: MagazineHandoffScene,
  magazinePoster: MagazinePosterScene,
  editorCredits: EditorCreditsScene,
};
