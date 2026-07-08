import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  bg: "#f7efde",
  text: "#3d2414",
  muted: "#7a5a3a",
  gold: "#b99b6b",
  wine: "#59282E",
};

/**
 * 매거진 리디자인 디자인 토큰 (2026 시안). 색 통일·수정 용이를 위해 여기 한 곳에서
 * 정의하고 모든 페이지가 이 토큰만 참조한다. 값 바꾸면 전 페이지 일괄 반영.
 */
export const MAG = {
  bg: "#FCF6EE", // 배경 크림
  text: "#4B2A2B", // 기본 텍스트(갈색)
  accent: "#892224", // 포인트(붉은색) — 챕터 라벨·룰·강조
};

/** 매거진 폰트 토큰 — 한글 MaruBuri, 영문 디스플레이 Old Standard TT. */
export const MAG_FONT = {
  kor: "MaruBuri",
  eng: "Old Standard TT",
};

// 라인(룰) 통일 토큰 — 모든 PDF 페이지가 같은 색·굵기 쓰도록.
export const RULE_COLOR = "#59282E";
export const RULE_WEIGHT = 1;

export const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    paddingHorizontal: 36,
    paddingVertical: 48,
    fontFamily: "Noto Serif KR",
    fontSize: 12,
    lineHeight: 1.85,
  },
  pageHeader: {
    marginBottom: 18,
    fontSize: 12,
    color: COLORS.muted,
    letterSpacing: 1.4,
  },
  pageFooter: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
  },
  coverTitle: {
    fontFamily: "Pretendard",
    fontWeight: 700,
    fontSize: 28,
    letterSpacing: 0.5,
  },
  coverHeadline: {
    marginTop: 36,
    fontSize: 18,
    fontFamily: "Noto Serif KR",
    fontWeight: 500,
    lineHeight: 1.5,
  },
  coverMeta: {
    marginTop: 18,
    fontSize: 12,
    color: COLORS.muted,
  },
  chapterLabel: {
    fontSize: 12,
    color: COLORS.muted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  chapterHeadline: {
    fontFamily: "Pretendard",
    fontWeight: 700,
    fontSize: 22,
    lineHeight: 1.3,
    marginBottom: 22,
  },
  body: {
    fontSize: 12,
    lineHeight: 2.0,
    marginBottom: 8,
  },
  pullQuote: {
    marginVertical: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
    fontSize: 14,
    lineHeight: 1.6,
    color: COLORS.text,
  },
  tocItem: {
    fontSize: 12,
    marginBottom: 8,
  },
  colophon: {
    marginTop: 28,
    fontSize: 12,
    color: COLORS.muted,
    lineHeight: 1.7,
  },
});
