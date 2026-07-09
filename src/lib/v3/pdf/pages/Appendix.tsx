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
          {threads.map((thread, ti) => {
            const [firstEntry, ...restEntries] = thread.entries;
            return (
            // thread 간 간격은 "앞 thread 의 marginBottom" 으로 부여 — 뒤 thread 가
            // wrap 되어 새 페이지 최상단에 떨어질 때 marginTop 이 없어 정확히 top 80(paddingTop)
            // 에서 시작한다. 첫 thread 만 부제 아래 marginTop 16. (inter-thread 간격:
            // 앞 thread 의 마지막 entry marginBottom 10 + thread marginBottom 10 = 20)
            <View key={ti} style={{ marginTop: ti === 0 ? 16 : 0, marginBottom: 10 }}>
              {/* 챕터 헤더 + 첫 entry 를 한 덩어리(wrap=false)로 묶는다.
                  → 페이지 하단 공간이 부족해 헤더만 남고 첫 질문이 다음 장으로
                  넘어가는 분리를 방지. 공간 부족 시 헤더째 다음 장 최상단으로 이동. */}
              <View wrap={false}>
                <View
                  style={{
                    paddingBottom: 20,
                    borderBottomWidth: 0.6,
                    borderBottomColor: WINE,
                  }}
                >
                  <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 1.4 }}>
                    {thread.chapter}
                  </Text>
                  <Text style={{ fontFamily: KOR, fontSize: 16, fontWeight: 700, color: TEXT, marginTop: 8 }}>
                    {thread.title}
                  </Text>
                </View>
                {firstEntry && (
                  <View style={{ marginTop: 20 }}>
                    <Entry entry={firstEntry} />
                  </View>
                )}
              </View>

              {/* 나머지 entries — 자연 흐름(wrap 허용). 각 Entry 는 marginBottom 으로
                  간격 부여 → wrap 시 새 페이지 상단에 떨어진 entry 도 marginTop 이 없어 top 80 에서 시작. */}
              {restEntries.length > 0 && (
                <View>
                  {restEntries.map((e, i) => (
                    <Entry key={i + 1} entry={e} />
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
function Entry({ entry }: { entry: AppendixEntry }) {
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

  const bodyFontSize = isQuestion ? 15 : 14;
  const bodyColor = isQuestion ? QUESTION_TEXT : TEXT;
  const bodyFontStyle = isQuestion ? "italic" : "normal";
  const bodyFontWeight = isQuestion ? 600 : 400;

  // 규칙 A — '질문'은 minPresenceAhead 로 break-after: avoid (뒤 답변 첫 줄과 유지).
  // 규칙 B — 답변/결과 박스는 wrap=true (break-inside auto) 로 자연 분할.
  return (
    <View
      wrap={!isQuestion}
      minPresenceAhead={isQuestion ? 64 : undefined}
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
      {/* 라벨 + 첫 문장 — wrap=false 로 묶어 라벨만 페이지 끝에 남는 것 방지. */}
      <View wrap={false}>
        <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}>
          {entry.label}
        </Text>
        <Text style={{ fontFamily: KOR, fontSize: bodyFontSize, fontWeight: bodyFontWeight, color: bodyColor, marginTop: 12, lineHeight: 1.7, fontStyle: bodyFontStyle }}>
          {firstSentence}
        </Text>
      </View>
      {/* 첫 문단의 나머지 문장 — 라인 레벨 wrap + orphans/widows 2. */}
      {firstRest ? (
        <Text orphans={2} widows={2} style={{ fontFamily: KOR, fontSize: bodyFontSize, fontWeight: bodyFontWeight, color: bodyColor, lineHeight: 1.7, fontStyle: bodyFontStyle }}>
          {firstRest}
        </Text>
      ) : null}
      {/* 이후 문단들 — 라인 레벨 wrap + orphans/widows 2. */}
      {restParagraphs.map((p, i) => (
        <Text
          key={i + 1}
          orphans={2}
          widows={2}
          style={{ fontFamily: KOR, fontSize: bodyFontSize, fontWeight: bodyFontWeight, color: bodyColor, marginTop: 8, lineHeight: 1.7, fontStyle: bodyFontStyle }}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}
