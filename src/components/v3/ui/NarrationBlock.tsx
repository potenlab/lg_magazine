"use client";

import { EditorialInline, toEditorialBlocks } from "@/components/v3/ui/EditorialText";

export function NarrationBlock({ text }: { text: string }) {
  return (
    <div className="space-y-3 italic leading-[1.7] text-[#7a5a3a]">
      {toEditorialBlocks([text]).map((block, i) => (
        <p key={i} className="whitespace-pre-line break-words">
          <EditorialInline text={block} />
        </p>
      ))}
    </div>
  );
}
