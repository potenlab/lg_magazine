import { Page, Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame, MAG_MARGIN, MAG_CONTENT_TOP } from "../MagazineFrame";

/**
 * Appendix — Editor's Note 뒷페이지.
 * 매거진 web AppendixSpread 의 PDF 버전. 챕터별 질문/답변/결과(엘아울 합성)
 * 를 한 자리에 모아 본다.
 *
 * 페이지 톤은 다른 본문 페이지와 동일:
 *   - paper bg + Vol.{name} 좌 / magazine STORY 우 + 와인 룰 헤더
 *   - paddingHorizontal 46 / paddingTop 20 / paddingBottom 50
 *   - #1 요소 marginTop 24, 라벨↔타이틀 8, 타이틀↔룰 20, 룰↔부제 20, 본문 16
 *     (Ch1~4 와 동일 리듬)
 *   - Page wrap=true — 본문 길면 자동 다음 페이지로 흐름. 헤더는 fixed 로 반복.
 *
 * Entry 디자인은 web AppendixSpread (MagazinePosterScene) 와 동일:
 *   - question — 좌측 골드 보더 + italic muted text
 *   - answer   — 흰 박스 + 골드 보더
 *   - result   — 베이지 박스 + 골드 보더 (엘아울 합성 톤)
 */

export type AppendixEntryTone = "question" | "answer" | "result";
export interface AppendixEntry {
  label: string;
  tone: AppendixEntryTone;
  text: string;
}
export interface AppendixThread {
  /** "Chapter 1" / "Chapter 2" … */
  chapter: string;
  /** "내가 지나온 길" 등 챕터 한글 제목 */
  title: string;
  entries: AppendixEntry[];
}

interface Props {
  name: string;
  threads: AppendixThread[];
}

const TEXT = MAG.text;
const WINE = MAG.accent;
const RULE = MAG.accent;
const MUTED = "#7a5a3a"; // 카드 라벨(뮤트 브라운)
const GOLD = "#b99b6b"; // 챕터 구분선·질문 좌보더
const CARD_BORDER = "#DCBBB5"; // 답변/결과 카드 보더
// 카드 배경 톤 (크림 계열).
const RESULT_BG = "#F5E9E2";
const ANSWER_BG = "#FDFAF5";
const QUESTION_TEXT = "#6b5337";
const KOR = MAG_FONT.kor;

// 챕터 헤더가 페이지 하단에 홀로 남지 않도록, 헤더 뒤에 확보해야 하는 최소 세로 공간(pt).
// 첫 entry 의 여백(20) + 카드 상단 패딩(16) + 라벨(≈15) + 라벨↔본문(12) + 첫 줄(≈24) ≈ 87.
const CHAPTER_KEEP_AHEAD = 88;

// 라벨 뒤로 확보해야 하는 최소 세로 공간(pt) — 라벨(≈15) + 첫 줄(14pt·lineHeight 1.7 ≈ 24) ≈ 40.
// 라벨 Text 에 minPresenceAhead 로 부여 → 카드가 페이지 하단 가까이에서 시작해도 라벨이
// 뒤에 이만큼 공간이 없으면 카드째 다음 페이지로 밀린다. 이게 요구 #3 "라벨 break-after:
// avoid"(라벨↔첫 문장 결합)의 react-pdf 번역이자, 카드 첫 조각이 ≈0 높이로 쪼개져
// 텍스트가 겹치던 회귀(요구 #4)의 근본 차단책 — wrap=false 래퍼(keeper)는 오히려 잘린
// 첫 조각 안에서 오버플로우/겹침을 유발하므로 쓰지 않는다.
const LABEL_KEEP_AHEAD = 40;

export function Appendix({ name, threads }: Props) {
  return (
    // Page 자체에 paddingTop/Horizontal/Bottom 부여 — wrap 페이지에도
    // 동일하게 적용되므로 헤더 위 여백 (20)·콘텐츠 위 여백 (71) 일관 유지.
    <Page
      size="A4"
      wrap
      style={{ backgroundColor: MAG.bg, fontFamily: KOR, color: MAG.text, paddingHorizontal: MAG_MARGIN, paddingTop: MAG_CONTENT_TOP, paddingBottom: 70 }}
    >
      {/* 공통 프레임 (헤더/푸터/페이지번호) */}
      <MagazineFrame name={name} />

      {/* 타이틀 — "Appendix"(와인) + "{name}님이 직접 적어주신 기록"(갈색) */}
      <View>
        <Text style={{ fontFamily: KOR, fontSize: 15, color: WINE }}>Appendix</Text>
        <Text style={{ fontFamily: KOR, fontSize: 26, color: TEXT, marginTop: 12 }}>
          <Text style={{ fontWeight: 700 }}>{name}님이 </Text>
          <Text style={{ fontWeight: 600 }}>직접 적어주신 기록</Text>
        </Text>
      </View>

      {/* 본문 — marginTop 16 (Ch1~4 본문 spacing). */}
      {threads.length === 0 ? (
        <Text style={{ fontFamily: KOR, fontSize: 13, color: MUTED, marginTop: 16 }}>
          기록할 답변이 아직 없어요.
        </Text>
      ) : (
        <View>
          {threads.map((thread, ti) => (
            // thread 간 간격은 "앞 thread 의 marginBottom" 으로 부여 — 뒤 thread 가
            // wrap 되어 새 페이지 최상단에 떨어질 때 marginTop 이 없어 정확히 top(paddingTop)
            // 에서 시작한다. 첫 thread 만 부제 아래 marginTop 16.
            <View key={ti} style={{ marginTop: ti === 0 ? 16 : 0, marginBottom: 10 }}>
              {/* 챕터 헤더 — wrap=false(자체 분할 불가) + minPresenceAhead 로 "헤더만 홀로
                  남는" 고립(요구 #1)만 완화한다. 첫 entry 와 통짜로 묶지 않으므로, 첫 카드는
                  하단 여백 없이 남은 공간부터 채우며 분할된다(요구 #3). */}
              <ChapterHeader thread={thread} minPresenceAhead={CHAPTER_KEEP_AHEAD} />

              {/* entries — 카드는 wrap 허용(분할). 라벨↔첫 문단 분리·문단 orphans/widows 는
                  Entry 내부에서 처리(요구 #2·#3). */}
              {thread.entries.map((e, i) => {
                const marginTop = i === 0 ? 20 : e.tone === "question" ? 10 : 0;
                return (
                  <View key={i} style={marginTop ? { marginTop } : undefined}>
                    <Entry entry={e} />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Page>
  );
}

/** 챕터 헤더(라벨+제목) — wrap=false 로 자체는 절대 쪼개지지 않는다. minPresenceAhead
 *  는 헤더가 첫 entry 와 묶이지 않는(긴 첫 카드) 경우에만 전달해 고립을 완화한다. */
function ChapterHeader({ thread, minPresenceAhead }: { thread: AppendixThread; minPresenceAhead?: number }) {
  return (
    <View
      wrap={false}
      minPresenceAhead={minPresenceAhead}
      style={{ paddingBottom: 20, borderBottomWidth: 0.6, borderBottomColor: WINE }}
    >
      <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 1.4 }}>{thread.chapter}</Text>
      <Text style={{ fontFamily: KOR, fontSize: 16, fontWeight: 700, color: TEXT, marginTop: 8 }}>{thread.title}</Text>
    </View>
  );
}

/**
 * Entry — 매거진 요약 (web AppendixSpread) UI 톤 그대로:
 *   question: 좌측 골드 보더 3px + 본문 italic muted color
 *   answer:   흰 박스 + 골드 보더 (round 4)
 *   result:   베이지 박스 + 골드 보더 (round 4) — 엘아울 합성 강조
 */
function Entry({ entry }: { entry: AppendixEntry }) {
  const isQuestion = entry.tone === "question";
  const isResult = entry.tone === "result";

  // 본문을 문단(\n\n) 단위로 split. 각 문단 <Text> 는 라인 레벨 wrap 허용
  // + orphans/widows 2 로 분할 시 최소 2줄 유지.
  const paragraphs = entry.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const safeParagraphs = paragraphs.length ? paragraphs : [entry.text];

  const bodyFontSize = isQuestion ? 15 : 14;
  const bodyColor = isQuestion ? QUESTION_TEXT : TEXT;
  const bodyFontStyle = isQuestion ? "italic" : "normal";
  const bodyFontWeight = isQuestion ? 600 : 400;

  // 카드(박스)는 wrap 허용(기본값, 고정 height 없음) — 페이지 하단에 걸치면 남은 공간을
  // 먼저 채우고 나머지 문단만 다음 페이지로 넘어간다(요구 #3: break-inside auto, 빈 여백
  // 최소화). 카드 통째 넘김(wrap=false)은 하단 여백 낭비를 유발하므로 쓰지 않는다.
  //
  // 라벨↔첫 문장 결합(요구 #3: label break-after avoid) 과 첫 조각 ≈0 겹침(요구 #4) 은
  // 라벨 Text 의 minPresenceAhead 로 처리한다(아래 render 참고). wrap=false keeper 는
  // 잘린 첫 조각 안에서 오버플로우/겹침을 유발하므로 쓰지 않는다.
  const bodyStyle = (i: number) => ({
    fontFamily: KOR,
    fontSize: bodyFontSize,
    fontWeight: bodyFontWeight,
    color: bodyColor,
    marginTop: i === 0 ? 12 : 8,
    lineHeight: 1.7,
    // 화살표 함수의 추론 반환 타입에서 리터럴이 string 으로 넓어지는 것 방지
    // (react-pdf FontStyle 은 "normal" | "italic" 유니온만 허용).
    fontStyle: bodyFontStyle as "normal" | "italic",
  });
  return (
    <View
      style={{
        marginBottom: 10,
        paddingLeft: isQuestion ? 0 : 16,
        paddingRight: isQuestion ? 0 : 16,
        paddingTop: isQuestion ? 0 : 16,
        paddingBottom: isQuestion ? 0 : 12,
        borderLeftWidth: isQuestion ? 2.5 : 0,
        borderLeftColor: isQuestion ? GOLD : undefined,
        borderWidth: isQuestion ? 0 : 1,
        borderColor: isQuestion ? undefined : CARD_BORDER,
        borderRadius: isQuestion ? 0 : 8,
        backgroundColor: isQuestion ? undefined : isResult ? RESULT_BG : ANSWER_BG,
      }}
    >
      {/* 라벨 — minPresenceAhead 로 라벨 뒤 여유(≈라벨+첫 줄)를 강제. 카드가 페이지 하단
          가까이에서 시작하면 라벨째 다음 페이지로 밀려, 라벨↔첫 문장 분리(요구 #3) 및
          첫 조각 ≈0 겹침(요구 #4)이 함께 차단된다. wrap=false 래퍼는 쓰지 않는다(잘린
          첫 조각 안에서 오버플로우/겹침 유발). */}
      <Text
        minPresenceAhead={LABEL_KEEP_AHEAD}
        style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}
      >
        {entry.label}
      </Text>
      {/* 본문 문단 — 카드는 wrap 허용(분할)이라 페이지 하단부터 채우고 나머지만 다음
          장으로 넘어간다(요구 #3, 빈 여백 최소화). orphans/widows 2 로 문단 분할 시
          한 줄 고아 방지. */}
      {safeParagraphs.map((p, i) => (
        <Text key={i} orphans={2} widows={2} style={bodyStyle(i)}>
          {p}
        </Text>
      ))}
    </View>
  );
}
