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
    ch1: `${CMN}/Chapter_01.jpg`,
    ch2: `${CMN}/Chapter02-3.jpg`,
    ch3: `${CMN}/Chapter03.jpg`,
    ch4: `${CMN}/chapter04.jpg`,
    ch5: `${CMN}/chapter05.jpg`,
  },
  commonImages: {
    dialogShort: `${CMN}/dialoge.jpg`,
    dialogLong: `${CMN}/dialoge_long.jpg`,
    finishChapter: `${CMN}/finish_chapter.jpg`,
    sunset: `${CMN}/Chapter_01.jpg`,
    memory: `${CMN}/Chapter_01-2.jpg`,
    ch1Arrival: `${CMN}/Chapter02-1.jpg`,
    ch2Arrival: `${CMN}/Chapter03-1.jpg`,
    ch3Arrival: `${CMN}/chapter04-1.jpg`,
    ch4Arrival: `${CMN}/chapter05.jpg`,
    ch2Start: `${CMN}/Chapter02-1.jpg`,

    introBackground: `${CMN}/background.jpg`,
    inviteLetter: `${CMN}/invite_letter.png`,
    letterUnfold: `${CMN}/letter_unfold.jpg`,
    letterUnfoldWrite: `${CMN}/letter_unfold_write.jpg`,
    bgStation: `${CMN}/bg_station.jpg`,
    bgTrain: `${CMN}/bg_train.jpg`,
    nameTicket: `${CMN}/name_ticket.jpg`,
    visionTicket: `${CMN}/vision_ticket_new.jpg`,
    brandingBookEffect: `${CMN}/finish_chapter.jpg`,
  },
};
