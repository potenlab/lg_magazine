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
          {threads.map((thread, ti) => (
            // thread 간 간격은 "앞 thread 의 marginBottom" 으로 부여 — 뒤 thread 가
            // wrap 되어 새 페이지 최상단에 떨어질 때 marginTop 이 없어 정확히 top 80(paddingTop)
            // 에서 시작한다. 첫 thread 만 부제 아래 marginTop 16. (inter-thread 간격:
            // 앞 thread 의 마지막 entry marginBottom 10 + thread marginBottom 10 = 20)
            <View key={ti} style={{ marginTop: ti === 0 ? 16 : 0, marginBottom: 10 }}>
              {/* 챕터 헤더(라벨+제목) — 2줄뿐인 작은 블록이라 wrap=false 로 자체 분리는
                  불가능(발생하지 않음). minPresenceAhead 로 "헤더만 페이지 끝에 홀로
                  남는" 고립만 방지(첫 entry 라벨 한 줄 분량 확보) — 첫 entry 전체를
                  헤더와 묶지 않으므로, 첫 entry 가 길어도 안전하게 그 아래에서부터
                  자연스럽게 다음 페이지로 흘러간다(요구 #1: 불필요한 여백 방지).
                  ※ minPresenceAhead 는 배경색 없는 보더 전용 블록에만 사용 —
                  테두리+배경 박스(Entry)에 걸면 겹침 회귀가 남(요구 #3, 아래 Entry 주석). */}
              <View
                wrap={false}
                minPresenceAhead={40}
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

              {/* entries — 카드 자체는 wrap 허용(기본값, 고정 height 없음): 페이지 하단에
                  걸치면 남는 공간까지 채우고 나머지 문단만 자연스럽게 다음 페이지로
                  흘러간다(요구 #1). 라벨↔첫 문장 분리·겹침 방지는 Entry 내부에서 처리
                  (요구 #2, #3). */}
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

  // 박스는 wrap 허용(기본값, 고정 height 없음) — 페이지 하단에 걸치면 남는 공간까지
  // 채우고 나머지 문단은 자연스럽게 다음 페이지로 흘러간다(요구 #1). 카드가 페이지보다
  // 커도 넘치지 않고 정상적으로 분할된다.
  // ※ 테두리+배경 박스 자체에 minPresenceAhead 를 걸면 react-pdf v4 에서 페이지 넘김
  //   시 텍스트가 겹쳐 그려지는 회귀가 있다 — 그래서 이 박스에는 절대 쓰지 않는다(요구 #3).
  //   라벨을 첫 문단과 wrap=false 로 묶는 것도 피한다: 엘아울의 기사(article body)처럼
  //   첫 문단 자체가 한 페이지보다 길 수 있는 entry 가 있어, 그 경우 묶음 자체가
  //   페이지보다 커져 같은 오버플로우/겹침이 재발한다. 대신 라벨 Text 에만
  //   minPresenceAhead 를 줘서(박스가 아니라 라벨 기준) 페이지 넘김 시 라벨이 페이지
  //   끝에 홀로 남고 첫 문장이 다음 장으로 떨어지는 분리만 막는다(요구 #2, 라벨+첫
  //   줄 확보). 라벨 자체는 항상 한 줄이라 안전하게 다음 페이지로 넘어갈 수 있다.
  const LABEL_KEEP_AHEAD = 30; // 라벨 + 첫 줄(14pt·lineHeight 1.7 ≈ 24pt) 확보
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
      <Text minPresenceAhead={LABEL_KEEP_AHEAD} style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}>
        {entry.label}
      </Text>
      {safeParagraphs.map((p, i) => (
        <Text
          key={i}
          orphans={2}
          widows={2}
          style={{ fontFamily: KOR, fontSize: bodyFontSize, fontWeight: bodyFontWeight, color: bodyColor, marginTop: i === 0 ? 12 : 8, lineHeight: 1.7, fontStyle: bodyFontStyle }}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}
