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
    serious: `${OWL}/l-owl-10.png`,
    writing: `${OWL}/l-owl-03.png`,
    laughing: `${OWL}/l-owl-14.png`,
    thinking: `${OWL}/l-owl-05.png`,
    handing: `${OWL}/l-owl-04.png`,
    listening: `${OWL}/l-owl-06.png`,
    offering: `${OWL}/l-owl-02.png`,
    contemplating: `${OWL}/l-owl-05.png`,
    closingBook: `${OWL}/l-owl-10.png`,
    welcoming: `${OWL}/l-owl-02.png`,
    scrutinizing: `${OWL}/l-owl-11.png`,
    explaining: `${OWL}/l-owl-15.png`,
    approving: `${OWL}/l-owl-14.png`,
    curious: `${OWL}/l-owl-05.png`,
    focusedWriting: `${OWL}/l-owl-12.png`,
    noteHanding: `${OWL}/l-owl-09.png`,
    sideGlance: `${OWL}/l-owl-13.png`,
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
    visionTicket: `${CMN}/vision_ticket_new.webp`,
    brandingBookEffect: "/vision_express/brandingbook_effect.png",
  },
};
