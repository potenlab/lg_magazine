import { Page, Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";
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
 *   - Page wrap=true — 본문 길면 자동 다음 페이지로 흐름. 헤더는 fixed 로 반복.
 *
 * ── 겹침/잘림 근본 구조 (2026-07-10) ─────────────────────────────────
 * react-pdf 는 (1) 배경+테두리 박스 안의 긴 텍스트가 페이지 경계에서 쪼개지면
 * 텍스트를 겹쳐 그리고, (2) wrap=false 블록이 "wrap 가능한 부모" 안에 중첩된 채
 * 경계에 걸리면 높이가 눌려 라벨/본문이 뭉개진다(실데이터 9p 겹침·잘림의 원인).
 * 그래서 이 파일은 두 가지를 강제한다:
 *   a. 모든 블록(챕터 헤더·카드 조각)은 Page 의 "직계 자식" — 중첩 wrap 부모 없음.
 *      페이지 나눔은 항상 블록 사이에서만 일어난다.
 *   b. 카드 본문은 문장 경계 기준 ≤CHUNK_TARGET 자 "원자 조각(wrap=false)"으로
 *      나눈다. 조각 하나는 최대 ~8줄(≈200pt)이라 페이지(≈690pt)를 절대 못 넘고,
 *      경계에 걸리면 통째로 다음 페이지로 이동한다 → 겹침·중간 잘림이 원천 불가능.
 *      같은 카드의 조각들은 배경+좌우 테두리를 공유해 한 박스처럼 보이고, 페이지가
 *      갈리는 지점에서만 박스 위/아래가 열려 보인다(의도된 트레이드오프).
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
const MUTED = "#7a5a3a"; // 카드 라벨(뮤트 브라운)
const GOLD = "#b99b6b"; // 챕터 구분선·질문 좌보더
const CARD_BORDER = "#DCBBB5"; // 답변/결과 카드 보더
// 카드 배경 톤 (크림 계열).
const RESULT_BG = "#F5E9E2";
const ANSWER_BG = "#FDFAF5";
const QUESTION_TEXT = "#6b5337";
const KOR = MAG_FONT.kor;

// 챕터 헤더가 페이지 하단에 홀로 남지 않도록, 헤더 뒤에 확보해야 하는 최소 세로 공간(pt).
const CHAPTER_KEEP_AHEAD = 88;

// 카드 조각 크기 — 14pt MaruBuri 기준 한 줄 ≈ 33자(가용폭 471pt).
// TARGET 170자 ≈ 5~6줄 ≈ 150pt: 경계 이동 시 낭비되는 여백의 상한이자,
// 페이지 높이(≈690pt)와 비교해 원자 이동이 절대 오버플로우하지 않는 크기.
const CHUNK_TARGET = 170;
// 문장 하나가 이보다 길면 공백에서 강제 분할(무문장부호 답변 방어).
const CHUNK_HARD = 260;

interface Chunk {
  text: string;
  /** 원문에서 문단(\n)이 시작되는 조각 — 문단 간격(10)을 준다. */
  paraStart: boolean;
}

/** 문장 종결부(.!?…。 + 닫는 따옴표/괄호)에서 자른다. 종결부 뒤가 공백/문자열 끝일
 *  때만 경계로 인정해 "3.5" 같은 소수점 오분리를 막는다. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === "。") {
      let end = i + 1;
      while (end < text.length && /["'’”)\]]/.test(text[end])) end++;
      if (end >= text.length || text[end] === " ") {
        const s = text.slice(start, end).trim();
        if (s) out.push(s);
        start = end;
        i = end - 1;
      }
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.length ? out : [text];
}

/** max 초과 문자열을 공백 기준으로 강제 분할. 공백이 없으면 그대로 자른다. */
function hardSplit(s: string, max: number): string[] {
  const parts: string[] = [];
  let cur = s;
  while (cur.length > max) {
    let cut = cur.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(cur.slice(0, cut).trim());
    cur = cur.slice(cut).trim();
  }
  if (cur) parts.push(cur);
  return parts;
}

/** 본문 → 원자 조각 목록. 문단(\n) → 문장 → ≤CHUNK_TARGET 그리디 그룹.
 *  조각 경계는 항상 문장 끝(또는 hardSplit 공백)이라 시각적으로 자연스럽다. */
function chunkEntryText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  for (const para of paras.length ? paras : [text]) {
    const sentences = splitSentences(para).flatMap((s) => hardSplit(s, CHUNK_HARD));
    let buf = "";
    let firstOfPara = true;
    const flush = () => {
      if (!buf) return;
      chunks.push({ text: buf, paraStart: firstOfPara });
      buf = "";
      firstOfPara = false;
    };
    for (const s of sentences) {
      if (buf && buf.length + s.length + 1 > CHUNK_TARGET) flush();
      buf = buf ? `${buf} ${s}` : s;
    }
    flush();
  }
  if (chunks.length === 0) chunks.push({ text, paraStart: true });
  return chunks;
}

export function Appendix({ name, threads }: Props) {
  // 모든 블록을 Page 직계 자식으로 평탄화 — 중첩 wrap 부모 제거(파일 상단 주석 a).
  const blocks: ReactElement[] = [];
  threads.forEach((thread, ti) => {
    blocks.push(<ChapterHeader key={`h${ti}`} thread={thread} first={ti === 0} />);
    thread.entries.forEach((entry, ei) => {
      const chunks = chunkEntryText(entry.text);
      chunks.forEach((chunk, ci) => {
        blocks.push(
          <EntryChunk
            key={`c${ti}-${ei}-${ci}`}
            entry={entry}
            chunk={chunk}
            isFirst={ci === 0}
            isLast={ci === chunks.length - 1}
            isFirstEntry={ei === 0}
          />,
        );
      });
    });
  });

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

      {threads.length === 0 ? (
        <Text style={{ fontFamily: KOR, fontSize: 13, color: MUTED, marginTop: 16 }}>
          기록할 답변이 아직 없어요.
        </Text>
      ) : (
        blocks
      )}
    </Page>
  );
}

/** 챕터 헤더(라벨+제목) — wrap=false 원자 블록. minPresenceAhead 로 헤더가
 *  페이지 끝에 홀로 남는 것만 완화한다. */
function ChapterHeader({ thread, first }: { thread: AppendixThread; first: boolean }) {
  return (
    <View
      wrap={false}
      minPresenceAhead={CHAPTER_KEEP_AHEAD}
      style={{
        marginTop: first ? 16 : 10,
        paddingBottom: 20,
        borderBottomWidth: 0.6,
        borderBottomColor: WINE,
      }}
    >
      <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 1.4 }}>{thread.chapter}</Text>
      <Text style={{ fontFamily: KOR, fontSize: 16, fontWeight: 700, color: TEXT, marginTop: 8 }}>{thread.title}</Text>
    </View>
  );
}

/**
 * EntryChunk — 카드의 원자 조각 하나(wrap=false, ≤CHUNK_TARGET 자).
 * 첫 조각만 라벨 + 상단 테두리/라운드/패딩, 마지막 조각만 하단 테두리/라운드/패딩.
 * 중간 조각은 배경+좌우 테두리만 이어받아 한 박스처럼 보인다.
 */
function EntryChunk({
  entry,
  chunk,
  isFirst,
  isLast,
  isFirstEntry,
}: {
  entry: AppendixEntry;
  chunk: Chunk;
  isFirst: boolean;
  isLast: boolean;
  isFirstEntry: boolean;
}) {
  const isQuestion = entry.tone === "question";
  const isResult = entry.tone === "result";

  // 카드 간 리듬: 챕터 첫 카드는 룰 아래 20, 질문 카드는 앞 카드와 10 (+ 앞 카드 mb 10).
  const cardTop = isFirst ? (isFirstEntry ? 20 : isQuestion ? 10 : 0) : 0;

  const label = isFirst ? (
    <Text style={{ fontFamily: KOR, fontSize: 12, color: WINE, letterSpacing: 0.6 }}>
      {entry.label}
    </Text>
  ) : null;
  const body = (
    <Text
      style={{
        fontFamily: KOR,
        fontSize: isQuestion ? 15 : 14,
        fontWeight: isQuestion ? 600 : 400,
        color: isQuestion ? QUESTION_TEXT : TEXT,
        marginTop: isFirst ? 12 : chunk.paraStart ? 10 : 4,
        lineHeight: 1.7,
        fontStyle: isQuestion ? "italic" : "normal",
      }}
    >
      {chunk.text}
    </Text>
  );

  if (isQuestion) {
    return (
      <View
        wrap={false}
        style={{
          marginTop: cardTop,
          marginBottom: isLast ? 10 : 0,
          paddingLeft: 12,
          borderLeftWidth: 2.5,
          borderLeftColor: GOLD,
        }}
      >
        {label}
        {body}
      </View>
    );
  }

  return (
    <View
      wrap={false}
      style={{
        marginTop: cardTop,
        marginBottom: isLast ? 10 : 0,
        backgroundColor: isResult ? RESULT_BG : ANSWER_BG,
        borderColor: CARD_BORDER,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: isFirst ? 1 : 0,
        borderBottomWidth: isLast ? 1 : 0,
        borderTopLeftRadius: isFirst ? 8 : 0,
        borderTopRightRadius: isFirst ? 8 : 0,
        borderBottomLeftRadius: isLast ? 8 : 0,
        borderBottomRightRadius: isLast ? 8 : 0,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: isFirst ? 16 : 0,
        paddingBottom: isLast ? 12 : 0,
      }}
    >
      {label}
      {body}
    </View>
  );
}
