import type { Concept } from "./types";

const CMN = "/vision_express/common";
const CH1 = "/vision_express/chapter01";
const CH2 = "/vision_express/chapter02";
const CH3 = "/vision_express/chapter03";
const CH4 = "/vision_express/chapter04";
const CH5 = "/vision_express/chapter05";
const OWL = "/vision_express/v3/owl";

export const personaConcept: Concept = {
  id: "persona",
  characterName: "편집장",
  characterImages: {
    serious: `${OWL}/l-owl-10.webp`,
    writing: `${OWL}/l-owl-03.webp`,
    laughing: `${OWL}/l-owl-14.webp`,
    thinking: `${OWL}/l-owl-05.webp`,
    handing: `${OWL}/l-owl-04.webp`,
    listening: `${OWL}/l-owl-06.webp`,
    offering: `${OWL}/l-owl-02.webp`,
    contemplating: `${OWL}/l-owl-05.webp`,
    closingBook: `${OWL}/l-owl-10.webp`,
    welcoming: `${OWL}/l-owl-02.webp`,
    scrutinizing: `${OWL}/l-owl-11.webp`,
    explaining: `${OWL}/l-owl-15.webp`,
    approving: `${OWL}/l-owl-14.webp`,
    curious: `${OWL}/l-owl-05.webp`,
    focusedWriting: `${OWL}/l-owl-12.webp`,
    noteHanding: `${OWL}/l-owl-09.webp`,
    sideGlance: `${OWL}/l-owl-13.webp`,
  },
  backgrounds: {
    ch1: `${CH1}/bg_01_more.png`,
    ch2: `${CH2}/bg_02_more.png`,
    ch3: `${CH3}/bg_03_more.png`,
    ch4: `${CH4}/bg_04_more.png`,
    ch5: `${CH5}/bg_05_more.png`,
  },
  commonImages: {
    dialogShort: `${CMN}/dialoge.webp`,
    dialogLong: `${CMN}/dialoge_long.webp`,
    finishChapter: `${CMN}/finish_chapter.webp`,
    sunset: `${CH1}/01_ordinary_background5.webp`,
    memory: `${CH1}/01_ordinary_background10.webp`,
    ch1Arrival: `${CH2}/02_Brand Identity_start.webp`,
    ch2Arrival: `${CMN}/03_Brand Vision 00.webp`,
    ch3Arrival: `${CMN}/04_Target Customer 00.webp`,
    ch4Arrival: `${CMN}/05_Action Plan 00.webp`,
    ch2Start: `${CH2}/02_Brand Identity_start.webp`,

    introBackground: `${CMN}/background.webp`,
    inviteLetter: `${CMN}/invite_letter.webp`,
    letterUnfold: `${CMN}/letter_unfold.webp`,
    letterUnfoldWrite: `${CMN}/letter_unfold_write.webp`,
    bgStation: `${CMN}/bg_station.webp`,
    bgTrain: `${CMN}/bg_train.webp`,
    nameTicket: `${CMN}/name_ticket.webp`,
    visionTicket: `${CMN}/vision_ticket2.webp`,
    brandingBookEffect: "/vision_express/brandingbook_effect.png",
  },
};
