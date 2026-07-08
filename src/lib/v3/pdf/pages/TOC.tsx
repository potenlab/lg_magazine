import { Image, Page, Text, View } from "@react-pdf/renderer";
import { MAG, MAG_FONT } from "../styles";
import { MagazineFrame } from "../MagazineFrame";

/**
 * TOC (Contents) — 시안(1122×1587) → A4(595×842) 스케일 ×0.5303 변환.
 *   공통 프레임: 크림 배경 + 헤더(Vol./magazine STORY + 룰) + 푸터(룰 + 페이지번호)
 *   Contents 대제목 + 우상단 ↗(arrow.png) + 2단 목차(좌: Letter/Ch1/Ch2, 우: Ch3/Ch4/Note/Appendix)
 *   색·폰트는 전부 디자인 토큰(MAG / MAG_FONT) 참조.
 */

const BG = MAG.bg;
const TEXT = MAG.text;
const WINE = MAG.accent;
const KOR = MAG_FONT.kor;

// 각 챕터의 고정 라벨/한글 타이틀 (매거진 전반 공통).
const KOR_TITLE: [string, string, string, string] = [
  "내가 지나온 길",
  "나는 누구인가",
  "내가 그리는 미래",
  "내일로 향하는 한 걸음",
];

interface Props {
  name: string;
  /** Chapter 1~4 의 dynamic headline (TOC sub). 인덱스 0 → Ch1. */
  chapterHeadlines: [string, string, string, string];
}

/** 목차 항목 위 짧은 와인 룰. */
function EntryRule() {
  return <View style={{ width: 51, height: 1.2, backgroundColor: WINE, marginBottom: 20 }} />;
}

/** 챕터 항목 — 룰 + "Chapter N. 한글타이틀"(와인) + sub(진한 회갈색 볼드). */
function ChapterEntry({ n, korTitle, sub, first }: { n: number; korTitle: string; sub: string; first?: boolean }) {
  return (
    <View style={{ marginTop: first ? 0 : 30 }}>
      <EntryRule />
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <Text style={{ fontFamily: KOR, fontWeight: 600, fontSize: 13, color: WINE }}>Chapter {n}.  </Text>
        <Text style={{ fontFamily: KOR, fontWeight: 600, fontSize: 13, color: WINE }}>{korTitle}</Text>
      </View>
      <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 16, color: TEXT }}>{sub}</Text>
    </View>
  );
}

/** 단일 타이틀 항목 (Editor's Letter 등) — 룰 + 타이틀. */
function LabelEntry({ label, first }: { label: string; first?: boolean }) {
  return (
    <View style={{ marginTop: first ? 0 : 30 }}>
      <EntryRule />
      <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 16, color: TEXT }}>{label}</Text>
    </View>
  );
}

export function TOC({ name, chapterHeadlines }: Props) {
  return (
    <Page size="A4" style={{ position: "relative", width: 595, height: 842, backgroundColor: BG, fontFamily: KOR, color: TEXT }}>
      {/* ── 공통 프레임 (헤더/푸터/페이지번호) ── */}
      <MagazineFrame name={name} />

      {/* ── ↗ 아이콘 (우상단) — arrow.png ── */}
      <Image src="/arrow.png" style={{ position: "absolute", top: 85, right: 30, width: 80, height: 80 }} />

      {/* ── 대제목 + 2단 목차 — 하단 90 anchor(밀리지 않게), 대제목↔목차 100 ── */}
      <View style={{ position: "absolute", left: 30, right: 30, bottom: 90 }}>
        <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 64, color: TEXT }}>Contents</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 60 }}>
          {/* 좌: Editor's Letter / Ch1 / Ch2 */}
          <View style={{ width: 259 }}>
            <LabelEntry label="Editor's Letter" first />
            <ChapterEntry n={1} korTitle={KOR_TITLE[0]} sub={chapterHeadlines[0]} />
            <ChapterEntry n={2} korTitle={KOR_TITLE[1]} sub={chapterHeadlines[1]} />
          </View>
          {/* 우: Ch3 / Ch4 / Editor's Note + Appendix — 좌 대비 180 내림(stagger) */}
          <View style={{ width: 259, marginTop: 180 }}>
            <ChapterEntry n={3} korTitle={KOR_TITLE[2]} sub={chapterHeadlines[2]} first />
            <ChapterEntry n={4} korTitle={KOR_TITLE[3]} sub={chapterHeadlines[3]} />
            <View style={{ marginTop: 30 }}>
              <EntryRule />
              <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 16, color: TEXT }}>Editor&apos;s Note</Text>
              <Text style={{ fontFamily: KOR, fontWeight: 700, fontSize: 16, color: TEXT, marginTop: 12 }}>Appendix</Text>
            </View>
          </View>
        </View>
      </View>

    </Page>
  );
}
