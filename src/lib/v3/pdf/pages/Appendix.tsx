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

  const bodyFontSize = isQuestion ? 15 : 14;
  const bodyColor = isQuestion ? QUESTION_TEXT : TEXT;
  const bodyFontStyle: "italic" | "normal" = isQuestion ? "italic" : "normal";
  const bodyFontWeight = isQuestion ? 600 : 400;

  const labelEl = (
    <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}>
      {entry.label}
    </Text>
  );
  const textStyle = (marginTop: number) => ({
    fontFamily: KOR,
    fontSize: bodyFontSize,
    fontWeight: bodyFontWeight,
    color: bodyColor,
    marginTop,
    lineHeight: 1.7,
    // 화살표 함수 추론 반환 타입에서 리터럴이 string 으로 넓어지는 것 방지.
    fontStyle: bodyFontStyle as "normal" | "italic",
  });

  // 질문 — 배경 없는 좌측 골드선. 짧고 분할 겹침 이슈 없어 그대로 흐름 렌더.
  if (isQuestion) {
    const paras = entry.text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const safe = paras.length ? paras : [entry.text];
    return (
      <View style={{ marginBottom: 10, paddingLeft: 12, borderLeftWidth: 2.5, borderLeftColor: GOLD }}>
        {labelEl}
        {safe.map((p, i) => (
          <Text key={i} orphans={2} widows={2} style={textStyle(i === 0 ? 12 : 6)}>
            {p}
          </Text>
        ))}
      </View>
    );
  }

  // 답변/결과 — 크림 배경 박스. react-pdf 는 배경+테두리 박스가 페이지 경계에서 쪼개지면
  // 텍스트를 겹쳐 그리는 한계가 있다(요구 #4 겹침). 그래서 카드를 "줄 단위" wrap=false
  // 세그먼트로 나눈다: 페이지는 세그먼트(줄) 사이에서만 갈리고, 각 세그먼트는 한 줄이라
  // 통째로 이동 → 페이지 경계에서 첫 조각이 ≈0 높이로 쪼개져 겹치는 일이 원천 차단된다.
  // 세그먼트들은 같은 배경 + 좌우 테두리로 연결돼 한 박스처럼 보이고, 첫/마지막에만
  // 상/하단 테두리·라운드를 준다. (페이지가 갈리는 지점에선 박스 위/아래가 열려 보임 —
  // 겹침 제거를 위한 의도된 트레이드오프.)
  //
  // 세그먼트 = 줄(\n) 단위. 라벨은 첫 세그먼트에 포함해 라벨↔첫 줄이 갈리지 않는다(요구 #3).
  // 앞에 빈 줄이 있었으면 문단 간격(10), 아니면 줄 간격(4)으로 marginTop 부여.
  const bg = isResult ? RESULT_BG : ANSWER_BG;
  const rawLines = entry.text.split("\n");
  const segs: { text: string; marginTop: number }[] = [];
  let blankBefore = false;
  for (const raw of rawLines) {
    const line = raw.trim();
    if (line === "") {
      blankBefore = true;
      continue;
    }
    segs.push({ text: line, marginTop: segs.length === 0 ? 12 : blankBefore ? 10 : 4 });
    blankBefore = false;
  }
  if (segs.length === 0) segs.push({ text: entry.text, marginTop: 12 });
  const last = segs.length - 1;

  return (
    <View style={{ marginBottom: 10 }}>
      {segs.map((seg, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            backgroundColor: bg,
            borderColor: CARD_BORDER,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: i === 0 ? 1 : 0,
            borderBottomWidth: i === last ? 1 : 0,
            borderTopLeftRadius: i === 0 ? 8 : 0,
            borderTopRightRadius: i === 0 ? 8 : 0,
            borderBottomLeftRadius: i === last ? 8 : 0,
            borderBottomRightRadius: i === last ? 8 : 0,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: i === 0 ? 16 : 0,
            paddingBottom: i === last ? 12 : 0,
          }}
        >
          {i === 0 && labelEl}
          <Text style={textStyle(seg.marginTop)}>{seg.text}</Text>
        </View>
      ))}
    </View>
  );
}
