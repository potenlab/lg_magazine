"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  className?: string;
}

export function HintInput({ value, onChange, placeholder, hint, multiline = true, className }: Props) {
  // Merge hint into placeholder. If both exist, prefer hint (the guidance)
  // over placeholder (usually a stale example) — QA round: small-text below
  // was being missed, guidance lives inside the input now.
  const effectivePlaceholder = hint ?? placeholder;
  return (
    <div className={className}>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={effectivePlaceholder}
          className="h-[180px] w-full resize-none rounded-md border border-[#b99b6b]/40 bg-white/60 p-4 text-[15px] leading-[1.7] text-[#3d2414] outline-none placeholder:whitespace-pre-line placeholder:text-[#a18965] focus:border-[#3d2414] break-words"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={effectivePlaceholder}
          className="w-full rounded-md border border-[#b99b6b]/40 bg-white/60 px-4 py-3 text-[15px] text-[#3d2414] outline-none placeholder:text-[#a18965] focus:border-[#3d2414]"
        />
      )}
    </div>
  );
}
