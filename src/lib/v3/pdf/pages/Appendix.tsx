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
          {threads.map((thread, ti) => {
            const [firstEntry, ...restEntries] = thread.entries;
            return (
            // 간격은 thread 별 marginTop 으로 부여 — 페이지가 wrap 되어
            // thread 가 새 페이지 상단에 떨어져도 동일 간격 유지된다.
            // 첫 thread 는 부제(본문 marginTop 16) 아래에 위치.
            <View key={ti} style={{ marginTop: ti === 0 ? 16 : 20 }}>
              {/* 챕터 헤더 + 첫 entry 를 한 덩어리(wrap=false)로 묶는다.
                  → 페이지 하단 공간이 부족해 헤더만 남고 첫 질문이 다음 장으로
                  넘어가는 분리를 방지. 공간 부족 시 헤더째 다음 장 최상단으로 이동. */}
              <View wrap={false}>
                <View
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
                {firstEntry && (
                  <View style={{ marginTop: 10 }}>
                    <Entry entry={firstEntry} isFirst />
                  </View>
                )}
              </View>

              {/* 나머지 entries — 자연 흐름(wrap 허용). 각 Entry 자체 marginTop 으로
                  간격 부여 (wrap 시 새 페이지 상단에 떨어진 entry 도 동일 간격 유지). */}
              {restEntries.length > 0 && (
                <View>
                  {restEntries.map((e, i) => (
                    <Entry key={i + 1} entry={e} isFirst={false} />
                  ))}
                </View>
              )}
            </View>
            );
          })}
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

  // 본문을 문단(\n\n) 단위로 split. 각 문단 <Text> 는 라인 레벨 wrap 허용
  // (규칙 B: break-inside auto) + orphans/widows 2 로 분할 시 최소 2줄 유지.
  const paragraphs = entry.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const safeParagraphs = paragraphs.length ? paragraphs : [entry.text];

  // 라벨이 페이지 끝에 홀로 남는 것(제목 잘림) 방지 — 라벨 + '첫 문장' 만
  // wrap=false 로 묶는다. (첫 문단 통째가 아니라 첫 문장만 묶어 atomic 블록을
  // 작게 유지 → 하단 빈 여백 최소화.) 첫 문단의 나머지·이후 문단은 라인 분할.
  const firstPara = safeParagraphs[0] || "";
  const sentMatch = firstPara.match(/^([\s\S]*?[.!?。][”’"'』」)\]]*)\s*([\s\S]*)$/);
  const firstSentence = sentMatch ? sentMatch[1].trim() : firstPara;
  const firstRest = sentMatch ? sentMatch[2].trim() : "";
  const restParagraphs = safeParagraphs.slice(1);

  const bodyFontSize = isQuestion ? 12 : 13;
  const bodyColor = isQuestion ? QUESTION_TEXT : TEXT;
  const bodyFontStyle = isQuestion ? "italic" : "normal";

  // 규칙 A — '질문'은 minPresenceAhead 로 break-after: avoid (뒤 답변 첫 줄과 유지).
  // 규칙 B — 답변/결과 박스는 wrap=true (break-inside auto) 로 자연 분할.
  return (
    <View
      wrap={!isQuestion}
      minPresenceAhead={isQuestion ? 64 : undefined}
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
      {/* 라벨 + 첫 문장 — wrap=false 로 묶어 라벨만 페이지 끝에 남는 것 방지. */}
      <View wrap={false}>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: 11, color: MUTED, letterSpacing: 0.6 }}>
          {entry.label}
        </Text>
        <Text style={{ fontFamily: "Noto Serif KR", fontSize: bodyFontSize, color: bodyColor, marginTop: 3, lineHeight: 1.65, fontStyle: bodyFontStyle }}>
          {firstSentence}
        </Text>
      </View>
      {/* 첫 문단의 나머지 문장 — 라인 레벨 wrap + orphans/widows 2. */}
      {firstRest ? (
        <Text orphans={2} widows={2} style={{ fontFamily: "Noto Serif KR", fontSize: bodyFontSize, color: bodyColor, lineHeight: 1.65, fontStyle: bodyFontStyle }}>
          {firstRest}
        </Text>
      ) : null}
      {/* 이후 문단들 — 라인 레벨 wrap + orphans/widows 2. */}
      {restParagraphs.map((p, i) => (
        <Text
          key={i + 1}
          orphans={2}
          widows={2}
          style={{ fontFamily: "Noto Serif KR", fontSize: bodyFontSize, color: bodyColor, marginTop: 8, lineHeight: 1.65, fontStyle: bodyFontStyle }}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}
