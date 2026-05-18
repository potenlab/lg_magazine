import type { ReactNode } from "react";

/**
 * Renders multi-paragraph body text with a drop-cap on the first paragraph's first character.
 * Body uses `\n\n` paragraph breaks (the LLM stub generates that).
 * If the first character is whitespace, falls back to no drop-cap.
 */
export function firstParagraphWithDropCap(body: string): ReactNode {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return null;
  const [first, ...rest] = paragraphs;
  const firstChar = first.charAt(0);
  const restOfFirst = first.slice(1);

  return (
    <>
      <p className="whitespace-pre-line">
        <span className="float-left mr-2 mt-1 font-serif text-5xl leading-none text-[#3d2414]">
          {firstChar}
        </span>
        {restOfFirst}
      </p>
      {rest.map((p, i) => (
        <p key={i} className="mt-4 whitespace-pre-line">
          {p}
        </p>
      ))}
    </>
  );
}
