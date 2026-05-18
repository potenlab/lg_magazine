/**
 * Concept = world/theme config that drives text and imagery across the
 * branding journey. Logic/layout stays in components; only strings and
 * image paths come from here.
 */

export type OwlPoseKey =
  | "serious"
  | "writing"
  | "laughing"
  | "thinking"
  | "handing"
  | "listening"
  | "offering"
  | "contemplating"
  | "closingBook"
  | "welcoming"
  | "scrutinizing"
  | "explaining"
  | "approving"
  | "curious"
  | "focusedWriting"
  | "noteHanding"
  | "sideGlance";

export type ConceptCharacterImages = Record<OwlPoseKey, string> & Record<string, string>;

export interface ConceptBackgrounds {
  /** Default base room for each chapter */
  ch1: string;
  ch2: string;
  ch3: string;
  ch4: string;
  ch5: string;
}

export interface ConceptCommonImages {
  /** Short dialog bubble background */
  dialogShort: string;
  /** Long dialog bubble background */
  dialogLong: string;
  /** finish card background (tarot-style chapter completion) */
  finishChapter: string;
  /** Ch1 narr5 sunset scene */
  sunset: string;
  /** Ch1 narr10 past recall scene */
  memory: string;
  /** Ch1 → Ch2 arrival image (end of Ch1) */
  ch1Arrival: string;
  /** Ch2 → Ch3 arrival station */
  ch2Arrival: string;
  /** Ch3 → Ch4 arrival station */
  ch3Arrival: string;
  /** Ch4 → Ch5 arrival station */
  ch4Arrival: string;
  /** Ch2 opening / start scene image (train pulling into station etc.) */
  ch2Start: string;

  /* ── Intro (envelope/letter/ticket/depart) ── */
  /** Intro base background (envelope, letter, register scenes) */
  introBackground: string;
  /** Closed envelope/invitation card */
  inviteLetter: string;
  /** Opened letter (read scene) */
  letterUnfold: string;
  /** Opened letter with handwritten signature */
  letterUnfoldWrite: string;
  /** Station background (register / ticket scenes) */
  bgStation: string;
  /** Train interior background (depart scene) */
  bgTrain: string;
  /** Name ticket image (clipboard / ticket reveal) */
  nameTicket: string;
  /** Final issued vision ticket */
  visionTicket: string;

  /** BookFinal "book" phase reveal — magical floating book in library */
  brandingBookEffect: string;
}

export interface Concept {
  /** Unique id, e.g. "persona", "atelier" */
  id: string;
  /** Display name of the character (e.g., "편집장", "장인") */
  characterName: string;
  /** 8 pose images for the character */
  characterImages: ConceptCharacterImages;
  /** Per-chapter base backgrounds */
  backgrounds: ConceptBackgrounds;
  /** Shared images (dialog, finish, arrival, etc.) */
  commonImages: ConceptCommonImages;
}
