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
    .replace(/[ \t]+/g, " ")
    .trim();
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
