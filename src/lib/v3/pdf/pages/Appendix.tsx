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
              {/* 챕터 헤더(라벨+제목) + 첫 entry 를 하나의 wrap=false 그룹으로 묶는다.
                  → 헤더만 페이지 끝에 홀로 남지 않고(요구 #2), 공간 부족 시 헤더부터
                  통째로 다음 페이지로 넘어간다. 챕터 첫 entry 는 대개 질문/짧은 답변이라
                  그룹이 페이지를 초과하지 않는다. */}
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
                {thread.entries[0] ? (
                  <View style={{ marginTop: 20 }}>
                    <Entry entry={thread.entries[0]} />
                  </View>
                ) : null}
              </View>

              {/* 나머지 entries — 각 박스는 Entry 내부에서 wrap=false 라 페이지 경계에서
                  split 되지 않고 통째로 다음 페이지로 넘어간다(라벨↔본문 분리·겹침 방지).
                  "질문" entry 앞에는 앞 카드(marginBottom 10)에 10 을 더해 총 20 간격. */}
              {thread.entries.slice(1).map((e, idx) => {
                const marginTop = e.tone === "question" ? 10 : 0;
                return (
                  <View key={idx + 1} style={marginTop ? { marginTop } : undefined}>
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

  // 박스는 wrap={false} — 페이지 경계에서 split 되지 않고 통째로 다음 페이지로
  // 넘어간다. 이렇게 하면:
  //   (1) 라벨만 페이지 끝에 남고 본문이 다음 장으로 떨어지는 분리가 없다(요구 #1),
  //   (2) 테두리+배경 박스가 페이지 경계에서 split 될 때 여러 줄이 겹쳐 그려지던
  //       react-pdf v4 회귀(요구 #3)가 근본적으로 사라진다.
  // ※ 대가: 한 박스가 한 페이지보다 크면 넘칠 수 있으나, Appendix 답변은 그 정도로
  //   길지 않다. (minPresenceAhead 는 split 상황에서만 의미 있으므로 더는 쓰지 않음.)
  return (
    <View
      wrap={false}
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
      <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}>
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
