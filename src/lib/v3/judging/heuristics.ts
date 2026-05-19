import type { Branch } from "@/lib/v3/scenes/types";

const EMOTION_WORDS = [
  "설렘", "두근", "뿌듯", "벅참", "벅찼", "감격", "행복", "기뻤", "기쁨",
  "떨림", "떨렸", "긴장", "몰입", "빠져들", "재미", "즐거", "보람", "뭉클",
  "묘하게", "마음", "감각",
];
const SCENE_WORDS = [
  "때", "순간", "장면", "프로젝트", "회의", "발표", "현장", "사무실",
  "팀원", "동료", "선배", "후배", "고객", "처음", "혼자", "함께",
];
const NEGATIVE_WORDS = ["모르겠", "없어", "없네", "없을", "없는 것", "비슷한 게", "글쎄", "잘 모르"];
const ABSTRACT_WORDS = ["멋진", "훌륭한", "성공", "행복", "잘 됐", "좋았", "좋은"];

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export type BranchRule =
  | "ch1FlowAnswer"
  | "ch2Common"
  | "ch2IdentityName"
  | "ch3FutureSelf"
  | "ch3FutureDay"
  | "ch3VisionLine"
  | "ch3Attraction"
  | "ch3AlreadyDoing"
  | "ch3Obstacles"
  | "ch3WhyReason"
  | "ch3Contribution"
  | "ch4FirstStep"
  | "ch4SupportPerson"
  | "ch4NeededResource";

export function judgeBranchHeuristic(rule: BranchRule, answer: string): { branch: Branch; reason: string } {
  const a = answer.trim();
  const len = a.length;

  if (rule === "ch1FlowAnswer") {
    if (len >= 60 && hasAny(a, EMOTION_WORDS)) return { branch: "D", reason: "구체적+감정" };
    if (hasAny(a, EMOTION_WORDS) && len >= 30) return { branch: "A", reason: "감정 있으나 장면 부족" };
    if (len < 30 || !hasAny(a, SCENE_WORDS)) return { branch: "B", reason: "장면 없음" };
    return { branch: "A", reason: "감정·생각 부족" };
  }

  if (rule === "ch2Common") {
    // A=표면적, B=모르겠음, D=깊은 공통점(advance)
    if (hasAny(a, NEGATIVE_WORDS)) return { branch: "B", reason: "모르겠음" };
    if (hasAny(a, ["팀", "혼자", "처음", "협업", "부서"]) && !hasAny(a, EMOTION_WORDS) && len < 60) {
      return { branch: "A", reason: "표면적 공통점 (상황 나열)" };
    }
    if (len < 25) return { branch: "B", reason: "너무 짧음 → 모르겠음 분기" };
    return { branch: "D", reason: "본질적 공통점 → 진행" };
  }

  if (rule === "ch2IdentityName") {
    // A=추상적, B=평이한 명사, D=본인다운(advance)
    if (hasAny(a, ABSTRACT_WORDS) || len < 6) return { branch: "A", reason: "너무 추상적" };
    if (len < 12 && /(사람|리더|개척자)/.test(a)) return { branch: "B", reason: "평이한 명사" };
    return { branch: "D", reason: "본인다운 답변" };
  }

  if (rule === "ch3FutureSelf") {
    // 14.2 spec: 모르겠음/추상적은 B로 통합 (장면 없음)
    if (hasAny(a, NEGATIVE_WORDS)) return { branch: "B", reason: "막막함 → 장면 없음" };
    if (/(팀장|임원|부장|차장|이사|VP|director)/i.test(a) && len < 60) {
      return { branch: "A", reason: "외적 성취 중심" };
    }
    if (hasAny(a, ABSTRACT_WORDS) && len < 50) return { branch: "B", reason: "추상적" };
    if (len >= 80) return { branch: "D", reason: "풍부" };
    return { branch: "B", reason: "추상적" };
  }

  if (rule === "ch3FutureDay") {
    if (/오전|오후|회의|보고서/.test(a) && !hasAny(a, EMOTION_WORDS) && len < 60) {
      return { branch: "A", reason: "일정 나열" };
    }
    if (len < 40) return { branch: "B", reason: "너무 짧음" };
    return { branch: "D", reason: "풍부" };
  }

  if (rule === "ch3VisionLine") {
    // A=일반적, B=직책·외적, D=본인다운(advance)
    if (/(성공한|좋은 리더|훌륭한)/.test(a) && len < 25) return { branch: "A", reason: "너무 일반적" };
    if (/(될 것이다|되어 있을|팀장|임원)/.test(a) && len < 30) return { branch: "B", reason: "직책·외적" };
    return { branch: "D", reason: "본인다운 한 줄" };
  }

  if (rule === "ch3Attraction") {
    if (hasAny(a, NEGATIVE_WORDS) || len < 8) return { branch: "A", reason: "막연함" };
    if (/(열심히|성장|발전|더 잘하고)/.test(a) && len < 20) return { branch: "A", reason: "너무 추상적" };
    return { branch: "D", reason: "충분" };
  }

  if (rule === "ch3AlreadyDoing") {
    if (len < 5) return { branch: "A", reason: "너무 짧음" };
    if (/(잘 모르겠|딱히없|없는 것 같아요$)/.test(a) && len < 15) return { branch: "A", reason: "막연함" };
    return { branch: "D", reason: "충분" };
  }

  if (rule === "ch3Obstacles") {
    if (hasAny(a, NEGATIVE_WORDS) && len < 15) return { branch: "A", reason: "장애물 언급 없음" };
    if (len < 8) return { branch: "A", reason: "너무 짧음" };
    return { branch: "D", reason: "충분" };
  }

  if (rule === "ch3WhyReason") {
    if (/(그냥|모르겠|없어요)/.test(a) && len < 15) return { branch: "A", reason: "막연함" };
    if (len < 6) return { branch: "A", reason: "너무 짧음" };
    return { branch: "D", reason: "충분" };
  }

  if (rule === "ch3Contribution") {
    if (/(도움이 되고 싶어요?$|좋은 사람)/.test(a) && len < 20) return { branch: "A", reason: "너무 추상적" };
    if (len < 8) return { branch: "A", reason: "너무 짧음" };
    return { branch: "D", reason: "충분" };
  }

  if (rule === "ch4FirstStep") {
    // 14.2 spec: 의무감 톤은 A로 통합 (감정·생각 부족 — 표면적 다짐)
    if (/(열심히|성실히|꾸준히)/.test(a) && len < 25) return { branch: "A", reason: "너무 추상적" };
    if (/(이직|퇴사|창업|MBA)/.test(a)) return { branch: "B", reason: "너무 큰 결심" };
    if (/해야겠/.test(a)) return { branch: "A", reason: "의무감 → 추상적" };
    return { branch: "D", reason: "구체적이고 본인다운" };
  }

  if (rule === "ch4SupportPerson" || rule === "ch4NeededResource") {
    // QA feedback: "함께할 사람 / 필요한 자원" are *supporting* elements of
    // the first step, not the core. If the participant says "없어요/모르겠
    // 어요", caring more by re-asking actually feels like pressure. So we
    // always advance (D) — reflectShort's NEGATIVE_GUARD turns a blank
    // answer into "아직 떠오르지 않으셨군요, 괜찮아요" so the exit still
    // feels warm rather than abrupt. The A branches on 4-5b / 4-6b are kept
    // in the script as a safety net but are effectively no longer reached.
    return { branch: "D", reason: "보조 항목 — 답 유무와 무관하게 공감하며 통과" };
  }

  return { branch: "D", reason: "기본 통과" };
}

/** Scene id 접두/패턴으로 어느 BranchRule을 쓸지 결정. */
export function ruleForScene(sceneId: string): BranchRule {
  if (sceneId === "1-2" || sceneId === "1-4") return "ch1FlowAnswer";
  if (sceneId === "2-2") return "ch2Common";
  if (sceneId === "2-9") return "ch2IdentityName";
  // 새 통합 매거진 씬(2-10, 이전 "2-magazine"): 카드 + 헤드라인 + 정체성 입력이
  // 한 페이지에 들어가며, 입력 즉시 같은 ch2IdentityName 룰로 judge → A/B면
  // 페이지 내 재질문, D면 페이지 "완성" 처리.
  if (sceneId === "2-10" || sceneId === "2-magazine") return "ch2IdentityName";
  // Chapter 3 매거진(3-10): 5 BEAT 카드 + visionLine 입력 + judge가 모두 통합.
  // 같은 ch3VisionLine 룰을 인라인으로 적용.
  if (sceneId === "3-10") return "ch3VisionLine";
  if (sceneId === "3-1b") return "ch3Attraction";
  if (sceneId === "3-2b") return "ch3AlreadyDoing";
  if (sceneId === "3-3b") return "ch3Obstacles";
  if (sceneId === "3-4b") return "ch3WhyReason";
  if (sceneId === "3-8b") return "ch3Contribution";
  // Legacy ch3 rules (old scene IDs no longer active, kept for safety)
  if (sceneId === "3-4") return "ch3FutureSelf";
  if (sceneId === "3-6") return "ch3FutureDay";
  if (sceneId === "3-9") return "ch3VisionLine";
  if (sceneId === "4-3") return "ch4FirstStep";
  if (sceneId === "4-5b") return "ch4SupportPerson";
  if (sceneId === "4-6b") return "ch4NeededResource";
  return "ch1FlowAnswer";
}

// ─── Self-tests (run once on module load in dev) ───
if (process.env.NODE_ENV !== "production") {
  const cases: Array<[BranchRule, string, Branch]> = [
    ["ch1FlowAnswer", "작년에 신규 캠페인 기획을 맡았을 때 처음으로 혼자 끝까지 만들어내며 몰입했고 마지막 발표에서 정말 뿌듯했던 그 순간이 잊히지 않아요", "D"],
    ["ch1FlowAnswer", "일이 잘 풀렸을 때요", "B"],
    ["ch2Common", "둘 다 팀 작업이었어요", "A"],
    ["ch2Common", "잘 모르겠어요", "B"],
    ["ch2Common", "둘 다 없던 걸 만들어내거나 누군가의 막막함을 풀어주는 순간이었어요", "D"],
    ["ch2IdentityName", "좋은 사람이요", "A"],
    ["ch2IdentityName", "막막함을 풀어주는 사람", "D"],
    ["ch3FutureSelf", "잘 모르겠어요", "B"],
    ["ch3FutureDay", "아침에 산책하며 오늘은 어떤 사람을 도울 수 있을까 생각하며 출근하고, 오후엔 후배와 길게 얘기하며 함께 길을 그리고 있을 거예요.", "D"],
    ["ch3VisionLine", "막막함을 풀어주는 자리에서 자기다운 빛을 내는 사람", "D"],
    ["ch4FirstStep", "이직 준비를 시작할 거예요", "B"],
    ["ch4FirstStep", "내일 아침 9시에 팀 슬랙에 스터디 멤버 모집 글을 올릴 거예요", "D"],
  ];
  for (const [rule, ans, expected] of cases) {
    const got = judgeBranchHeuristic(rule, ans).branch;
    if (got !== expected) {
      console.warn(
        `[v3 heuristic self-test] rule=${rule} expected=${expected} got=${got}\n  answer="${ans}"`,
      );
    }
  }
}
