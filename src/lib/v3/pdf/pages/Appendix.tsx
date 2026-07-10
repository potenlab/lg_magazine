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
              {/* 챕터 헤더(라벨+제목) — 자체는 wrap=false 로 원자(2줄뿐이라 페이지 초과 불가,
                  분리 안 됨). minPresenceAhead 로 뒤 entry 와 함께 유지(헤더만 페이지 끝에 남는
                  것 방지). ※ 첫 entry 를 헤더와 원자로 묶지는 않으므로, 긴 답변이 페이지를
                  넘쳐 겹치는 일은 없다. */}
              <View
                wrap={false}
                minPresenceAhead={130}
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

              {/* entries — 자연 흐름(각 박스 wrap 허용). 첫 entry 는 헤더 아래 marginTop 20,
                  이후는 각 Entry 의 marginBottom 으로 간격. wrap 시 새 페이지 상단에 떨어져도
                  marginTop 이 없어 top 80 에서 시작. */}
              {thread.entries.map((e, i) => {
                // 첫 entry 는 헤더 아래 marginTop 20. 이후 "질문" entry 앞에는
                // 앞 카드(marginBottom 10)에 10 을 더해 총 20 간격을 준다
                // (답변카드 ↔ 다음 질문 사이 간격 20 요구).
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

  // 박스는 전부 wrap 허용(원자 블록 없음) → 아무리 긴 답변도 페이지 경계에서 자연
  // 분할, 페이지를 넘쳐 겹치는 일이 없다.
  // ※ react-pdf v4 에서 테두리+배경 "박스(View)" 에 minPresenceAhead 를 걸면, 페이지
  //   끝 여백에서 그 값이 충족되지 못할 때 다음 요소가 이전 콘텐츠 위에 겹쳐 그려지는
  //   회귀가 있다. → 박스 View 에는 minPresenceAhead 를 절대 쓰지 않는다.
  //   대신 라벨 Text 에만 minPresenceAhead 를 줘서(박스가 아니라 라벨 기준),
  //   페이지 넘김 시 라벨이 페이지 끝에 홀로 남고 첫 문장이 다음 장으로 떨어지는
  //   분리를 막는다(라벨 + 첫 줄 함께 이동). 라인 레벨 orphans/widows 는 보조.
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
