import { Image, Page, Text, View } from "@react-pdf/renderer";

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

const TEXT = "#3d2414";
const MUTED = "#7a5a3a";
const WINE = "#59282E";
const RULE = "#59282E";
const GOLD = "#b99b6b";
// 매거진 요약 (web) UI palette — bg-[#ede1c6]/40, bg-white/55. PDF 는 alpha
// 합성이 약해 미리 섞인 톤으로 대체.
const RESULT_BG = "#f3e8cc";
const ANSWER_BG = "#fbf6e8";
const QUESTION_TEXT = "#6b5337";
const PAPER = "/paper.jpg";

export function Appendix({ name, threads }: Props) {
  return (
    // Page 자체에 paddingTop/Horizontal/Bottom 부여 — wrap 페이지에도
    // 동일하게 적용되므로 헤더 위 여백 (20)·콘텐츠 위 여백 (71) 일관 유지.
    <Page
      size="A4"
      wrap
      style={{ paddingHorizontal: 46, paddingTop: 71, paddingBottom: 50 }}
    >
      {/* paper bg — fixed (모든 페이지 반복) */}
      <Image
        src={PAPER}
        fixed
        style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }}
      />

      {/* fixed header — absolute 좌표로 모든 페이지 동일 위치에 고정.
          flow 공간을 차지하지 않으므로 본문은 Page paddingTop(71) 부터 시작.
          헤더 위 여백 20 + Vol 텍스트 ~14 + rule marginTop 12 + 1 = ~47pt 가
          헤더가 차지하는 영역, 그 아래 71 - 47 = 24pt 가 breathing room. */}
      <View fixed style={{ position: "absolute", top: 20, left: 46, right: 46 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: TEXT }}>Vol. {name}</Text>
          <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: WINE }}>magazine STORY</Text>
        </View>
        <View style={{ height: 1, backgroundColor: WINE, marginTop: 12 }} />
      </View>

      {/* #1 — Title 블록. Page paddingTop 가 이미 헤더 아래 24pt 갭을 줘서
          자체 marginTop 0. */}
      <View>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 12, color: MUTED, letterSpacing: 0 }}>
          APPENDIX
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 26, fontWeight: 700, color: TEXT, marginTop: 8 }}>
          {name}님이 직접 적어주신 기록
        </Text>
        <View style={{ height: 1, backgroundColor: RULE, marginTop: 20, width: 80 }} />
      </View>

      {/* 본문 — marginTop 16 (Ch1~4 본문 spacing). */}
      {threads.length === 0 ? (
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 13, color: MUTED, marginTop: 16 }}>
          기록할 답변이 아직 없어요.
        </Text>
      ) : (
        <View>
          {threads.map((thread, ti) => (
            // 간격은 thread 별 marginTop 으로 부여 — 페이지가 wrap 되어
            // thread 가 새 페이지 상단에 떨어져도 동일 간격 유지된다.
            // 첫 thread 는 부제(본문 marginTop 16) 아래에 위치.
            <View key={ti} style={{ marginTop: ti === 0 ? 16 : 20 }}>
              {/* 챕터 헤더 — wrap={false} + minPresenceAhead 로 페이지 하단에
                  덩그러니 라벨만 남는 것 방지 (규칙 B: 대제목 위치 방어).
                  헤더 자체(~36pt) + 첫 entry 라벨·1~2줄(~80pt) 공간 확보. */}
              <View
                wrap={false}
                minPresenceAhead={120}
                style={{
                  paddingBottom: 6,
                  borderBottomWidth: 0.6,
                  borderBottomColor: GOLD,
                }}
              >
                <Text style={{ fontFamily: "Noto Serif KR", fontSize: 11, color: MUTED, letterSpacing: 1.4 }}>
                  {thread.chapter}
                </Text>
                <Text style={{ fontFamily: "Noto Serif KR", fontSize: 15, fontWeight: 700, color: TEXT, marginTop: 2 }}>
                  {thread.title}
                </Text>
              </View>

              {/* 챕터 entries — 각 Entry 가 자체 marginTop 으로 간격 부여
                  (wrap 시 새 페이지 상단에 떨어진 entry 도 동일 간격 유지). */}
              <View style={{ marginTop: 10 }}>
                {thread.entries.map((e, i) => (
                  <Entry key={i} entry={e} isFirst={i === 0} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Page>
  );
}

/**
 * Entry — 매거진 요약 (web AppendixSpread) UI 톤 그대로:
 *   question: 좌측 골드 보더 3px + 본문 italic muted color
 *   answer:   흰 박스 + 골드 보더 (round 4)
 *   result:   베이지 박스 + 골드 보더 (round 4) — 엘아울 합성 강조
 */
function Entry({ entry, isFirst }: { entry: AppendixEntry; isFirst?: boolean }) {
  const isQuestion = entry.tone === "question";
  const isResult = entry.tone === "result";

  // 본문을 문단(\n\n) 단위로 split — react-pdf 는 children 경계에서만 page-break
  // 가 일어나므로, 각 문단을 자체 <View wrap={false}> 로 감싸면 문단 중간(라인)
  // 에서는 절대 잘리지 않고, 정 길어 한 페이지를 넘으면 문단 경계에서만 분할됨.
  // (규칙 C: 부득이한 분할 시 문단 단위)
  const paragraphs = entry.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const safeParagraphs = paragraphs.length ? paragraphs : [entry.text];

  // 박스 통째로 다음 페이지로 미는 케이스: minPresenceAhead 를 라벨+첫문단
  // 평균(~80pt) 으로 설정. 페이지 끝에서 라벨만 남고 답변이 뚝 끊기는 케이스
  // 방지. (규칙 A)
  // 질문(isQuestion)은 짧으므로 wrap=false 로 통째 보호.
  return (
    <View
      wrap={!isQuestion}
      minPresenceAhead={isQuestion ? undefined : 80}
      style={{
        marginTop: isFirst ? 0 : 10,
        paddingLeft: 10,
        paddingRight: isQuestion ? 0 : 10,
        paddingVertical: isQuestion ? 5 : 8,
        borderLeftWidth: isQuestion ? 2.5 : 0,
        borderLeftColor: isQuestion ? GOLD : undefined,
        borderWidth: isQuestion ? 0 : 0.6,
        borderColor: isQuestion ? undefined : GOLD,
        borderRadius: isQuestion ? 0 : 4,
        backgroundColor: isQuestion ? undefined : isResult ? RESULT_BG : ANSWER_BG,
      }}
    >
      {/* 라벨 + 첫 문단은 한 덩어리로 보호 — 라벨만 페이지 끝에 남는 회귀 방지. */}
      <View wrap={false}>
        <Text
          style={{
            fontFamily: "Noto Serif KR",
            fontSize: 11,
            color: MUTED,
            letterSpacing: 0.6,
          }}
        >
          {entry.label}
        </Text>
        <Text
          style={{
            fontFamily: "Noto Serif KR",
            fontSize: isQuestion ? 12 : 13,
            color: isQuestion ? QUESTION_TEXT : TEXT,
            marginTop: 3,
            lineHeight: 1.65,
            fontStyle: isQuestion ? "italic" : "normal",
          }}
        >
          {safeParagraphs[0]}
        </Text>
      </View>

      {/* 2번째 이후 문단들 — 각각 wrap=false 로 문단 중간 분할 방지. */}
      {safeParagraphs.slice(1).map((p, i) => (
        <View key={i} wrap={false}>
          <Text
            style={{
              fontFamily: "Noto Serif KR",
              fontSize: isQuestion ? 12 : 13,
              color: isQuestion ? QUESTION_TEXT : TEXT,
              marginTop: 8,
              lineHeight: 1.65,
              fontStyle: isQuestion ? "italic" : "normal",
            }}
          >
            {p}
          </Text>
        </View>
      ))}
    </View>
  );
}
