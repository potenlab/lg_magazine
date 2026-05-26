import type { Concept } from "./types";

const CMN = "/vision_express/common";
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
    ch1: `${CMN}/Chapter_01.webp`,
    ch2: `${CMN}/Chapter02-3.webp`,
    ch3: `${CMN}/Chapter03.webp`,
    ch4: `${CMN}/chapter04.webp`,
    ch5: `${CMN}/chapter05.webp`,
  },
  commonImages: {
    dialogShort: `${CMN}/dialoge.webp`,
    dialogLong: `${CMN}/dialoge_long.webp`,
    finishChapter: `${CMN}/finish_chapter.webp`,
    sunset: `${CMN}/Chapter_01.webp`,
    memory: `${CMN}/Chapter_01-2.webp`,
    ch1Arrival: `${CMN}/Chapter02-1.webp`,
    ch2Arrival: `${CMN}/Chapter03-1.webp`,
    ch3Arrival: `${CMN}/chapter04-1.webp`,
    ch4Arrival: `${CMN}/chapter05.webp`,
    ch2Start: `${CMN}/Chapter02-1.webp`,

    introBackground: `${CMN}/background.webp`,
    inviteLetter: `${CMN}/invite_letter.webp`,
    letterUnfold: `${CMN}/letter_unfold.webp`,
    letterUnfoldWrite: `${CMN}/letter_unfold_write.webp`,
    bgStation: `${CMN}/bg_station.webp`,
    bgTrain: `${CMN}/bg_train.webp`,
    nameTicket: `${CMN}/name_ticket.webp`,
    visionTicket: `${CMN}/vision_ticket_new.webp`,
    brandingBookEffect: `${CMN}/finish_chapter.webp`,
  },
};
