"use client";

/**
 * Inline italic-text navigation button — used for 이전 / 다음 in
 * <DialogFooter> instead of full StoryButtonV3 buttons. Action triggers
 * (건네기 / 선택하기 / 이걸로 할게요 / 잘 읽었어요 / etc.) stay as
 * StoryButtonV3 so they read as the page's primary commitment; the
 * lightweight nav lives at the same baseline as plain text.
 */
export function NavText({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="italic text-[16px] text-[#8b7050] transition hover:text-[#3d2414] disabled:opacity-40 disabled:hover:text-[#8b7050]"
      style={{ fontFamily: "var(--font-ridi-batang)" }}
    >
      {label}
    </button>
  );
}
