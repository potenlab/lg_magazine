"use client";

import type { ReactNode } from "react";

const LONG_PARAGRAPH_THRESHOLD = 120;
const MAX_PARAGRAPH_CHARS = 130;

export function polishEditorialText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/([가-힣])\.(?:에|으로|로|을|를|이|가|은|는)(?=\s|[가-힣])/g, "$1.")
    .replace(/\s+([,.!?。])/g, "$1")
    // LLM이 종종 마침표·쉼표 직후에 강조 따옴표를 공백 없이 붙여 쓴다
    // ("거죠.'마음맞는...'") — EditorialInline 이 작은 따옴표 구간을
    // 강조 굵게 렌더하므로, 시작 따옴표 앞에 공백을 보장해 "...거죠.
    // '마음맞는...'" 으로 자연스럽게 흐르게 한다. 종료 측은 조사가
    // 바로 붙는 경우(`'나'를`)가 정상이라 건드리지 않는다.
    .replace(/(\S)('[^']+')/g, "$1 $2")
    .replace(/[ \t]+/g, " ");
  // NOTE: intentionally no .trim() — EditorialInline is called on segments
  // around **bold** spans by BoldMarkdown; trimming would eat the space
  // before/after bold. Outer paragraph trim is handled by toEditorialBlocks.
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?。]+[.!?。]?/g);
  return (matches ?? [text]).map((s) => s.trim()).filter(Boolean);
}

function splitLongParagraph(paragraph: string): string[] {
  const cleaned = polishEditorialText(paragraph);
  if (cleaned.length <= LONG_PARAGRAPH_THRESHOLD) return [cleaned];

  const sentences = splitSentences(cleaned);
  if (sentences.length <= 1) return [cleaned];

  const blocks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const nextLength = currentLength + sentence.length;
    if (current.length > 0 && (current.length >= 2 || nextLength > MAX_PARAGRAPH_CHARS)) {
      blocks.push(current.join(" "));
      current = [];
      currentLength = 0;
    }
    current.push(sentence);
    currentLength += sentence.length;
  }

  if (current.length > 0) blocks.push(current.join(" "));
  return blocks;
}

export function toEditorialBlocks(lines: string[]): string[] {
  return lines.flatMap((line) =>
    line
      .split(/\n\s*\n/g)
      .flatMap(splitLongParagraph)
      .map((block) => block.trim())
      .filter(Boolean),
  );
}

export function EditorialInline({ text }: { text: string }) {
  const parts = polishEditorialText(text).split(/('[^']+')/g);
  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (part.startsWith("'") && part.endsWith("'") && part.length > 2) {
          return (
            <strong key={i} className="font-semibold text-[#5a2d17]">
              {part}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
