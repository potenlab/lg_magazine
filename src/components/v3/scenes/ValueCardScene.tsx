"use client";

import { useContext, useEffect, useState } from "react";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { VALUE_CARD_CATEGORIES, VALUE_CARD_EN } from "@/lib/v3/valueCards";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function ValueCardScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const [picked, setPicked] = useState<string[]>(session.selectedValues);
  const [custom, setCustom] = useState("");
  const [settled, setSettled] = useState(false);

  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;
  const [showLines, setShowLines] = useState(!narration);
  const { setStage } = useContext(DialogStageContext);
  useEffect(() => {
    setStage(!showLines && narration ? "narration" : "content");
  }, [showLines, narration, setStage]);

  const toggle = (card: string) => {
    setPicked((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : prev.length < 3 ? [...prev, card] : prev,
    );
  };

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (picked.includes(v)) return;
    if (picked.length >= 3) return;
    setPicked([...picked, v]);
    setCustom("");
  };

  const submit = () => {
    if (picked.length === 0) return;
    patch({ selectedValues: picked });
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  if (!showLines && narration) {
    return (
      <div
        className="flex flex-1 cursor-pointer flex-col rounded-md border border-[#d7bd83]/30 bg-[#f6efdf]/95 p-7 shadow-2xl"
        onClick={() => setShowLines(true)}
      >
        <div className="flex-1">
          <NarrationBlock text={narration} />
        </div>
        <div className="mt-auto flex items-center justify-end text-[14px] text-[#8b7050]">
          <span className="italic">다음</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Menu board ─────────────────────────────────────────────
          Dark wood / parchment background framed in gilded edges so the
          card grid feels like the cabin's wall-mounted value menu rather
          than a generic web form. */}
      <div
        className="relative rounded-lg p-4 shadow-2xl ring-1 ring-[#7a5a2e]/50 sm:p-5"
        style={{
          background:
            "linear-gradient(180deg, #3a2818 0%, #2a1d12 100%)",
        }}
      >
        {/* Gilded inner frame */}
        <div className="pointer-events-none absolute inset-2 rounded-md ring-1 ring-[#a78550]/30" />

        {/* Intro lines — sit on the dark board, parchment ink color */}
        <div className="relative mb-4 px-2 text-center">
          <AutoFlowTextLight lines={lines} onSettled={() => setSettled(true)} />
        </div>

        {settled && (
          // Portrait (3:4) cards — capped grid width keeps each card a
          // sensible size on wide dialogs (instead of stretching the whole
          // 1156px and producing 240px-tall cards that need scrolling).
          <div className="relative mx-auto grid max-w-[640px] grid-cols-3 gap-2 sm:grid-cols-6">
            {VALUE_CARD_CATEGORIES.map((cat) => {
              return (
                <div key={cat.id} className="flex flex-col gap-1.5">
                  {/* Category header chip — emoji + Korean label, original
                      taxonomy. EN label retained in data only (was used in
                      a one-off mock; participants prefer the Korean copy). */}
                  <div
                    className="flex items-center justify-center gap-1 rounded-sm py-1 text-center text-[12px] font-semibold tracking-[0.05em] text-white shadow-sm"
                    style={{ background: cat.accent }}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </div>

                  {/* Cards */}
                  {cat.cards.map((card) => {
                    const en = VALUE_CARD_EN[card] ?? card;
                    const selected = picked.includes(card);
                    const disabled = !selected && picked.length >= 3;
                    return (
                      <button
                        key={card}
                        type="button"
                        onClick={() => toggle(card)}
                        disabled={disabled}
                        className={`relative flex aspect-[3/4] flex-col items-center justify-center rounded-md border-2 px-1 py-2 text-center transition disabled:opacity-30 ${
                          selected
                            ? "border-[#3d2414] bg-[#ede1c6] shadow-md ring-2 ring-[#f5d97a]"
                            : "border-[#b99b6b]/40 bg-[#f6efdf] hover:bg-[#fff8e5]"
                        }`}
                      >
                        {/* Tiny suit-mark in the category accent — top-right corner */}
                        <span
                          className="absolute right-1 top-1 text-[12px]"
                          style={{ color: cat.accent }}
                        >
                          ♥
                        </span>
                        {/* English label as the small sub-tag, Korean word
                            as the main face — Korean is what participants
                            actually read, so it gets the size + weight. */}
                        <span className="text-[12px] tracking-wide leading-tight text-[#8b7050]">
                          {en}
                        </span>
                        <span className="mt-0.5 text-[14px] font-semibold leading-tight text-[#3d2414]">
                          {card}
                        </span>
                      </button>
                    );
                  })}

                </div>
              );
            })}
          </div>
        )}

        {/* Custom-card input bar — moved out of the grid so every column has
            the same height (header + 5 cards). Saves one full card-row of
            vertical space, which lets the entire 5-row grid + chrome fit in
            a single viewport on standard laptops. */}
        {settled && (
          <div className="relative mx-auto mt-3 flex max-w-[640px] gap-2">
            <div className="relative flex flex-1 items-center gap-2 rounded-md border-2 border-dashed border-[#a78550]/40 bg-[#f6efdf]/15 px-3 py-1.5">
              <span className="shrink-0 text-[12px] tracking-wider text-[#d4b88a]">
                여기 없어요? 직접 적기 [+]
              </span>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder=""
                disabled={picked.length >= 3}
                className="flex-1 bg-transparent text-[12px] text-[#f0e3c0] placeholder:text-[#8b7050] focus:outline-none disabled:opacity-40"
              />
            </div>
            <button
              type="button"
              onClick={addCustom}
              disabled={picked.length >= 3 || custom.trim().length === 0}
              className="rounded-md border border-[#a78550]/50 bg-[#f6efdf]/10 px-3 text-[12px] text-[#f0e3c0] transition hover:bg-[#f6efdf]/20 disabled:opacity-30"
            >
              추가
            </button>
          </div>
        )}

        {/* Bottom strip: counter + L-OWL mark */}
        {settled && (
          <div className="relative mt-4 flex items-center justify-between px-2 text-[12px] tracking-[0.2em] text-[#d4b88a]/80">
            <span className="invisible">L-OWL</span>
            <span className="font-medium">선택한 카드: {picked.length}/3</span>
            <span className="font-semibold tracking-[0.3em]">L-OWL</span>
          </div>
        )}
      </div>

      {/* Selected chips — sit on the dark page background */}
      {settled && picked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#d4b88a]">선택:</span>
          {picked.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPicked((prev) => prev.filter((c) => c !== p))}
              className="group inline-flex items-center gap-1.5 rounded-full border border-[#d4b88a]/40 bg-[#f6efdf]/10 px-3 py-1 text-xs text-[#f6efdf] transition hover:border-[#f5d97a] hover:bg-[#f6efdf]/20"
              title="클릭하면 빼요"
            >
              {p}
              <span className="text-[#d4b88a] transition group-hover:text-[#f5d97a]">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Submit row */}
      <div
        className={`sticky bottom-0 z-10 mt-auto flex justify-end pt-3 transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "전달하기"}
          onClick={submit}
          disabled={picked.length === 0}
          ritual
        />
      </div>
    </div>
  );
}

/** Light-text variant of AutoFlowText for use on the dark menu board.
 * AutoFlowText's text color is hardcoded for the parchment dialog, so we
 * inline the same staggered reveal logic with the parchment-light tone. */
function AutoFlowTextLight({
  lines,
  onSettled,
}: {
  lines: string[];
  onSettled?: () => void;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= lines.length) {
      onSettled?.();
      return;
    }
    const t = setTimeout(() => setShown((s) => Math.min(s + 1, lines.length)), shown === 0 ? 100 : 1200);
    return () => clearTimeout(t);
  }, [shown, lines.length, onSettled]);

  return (
    <div className="space-y-2 text-[14px] leading-[1.58] text-[#f0e3c0]">
      {lines.slice(0, shown).map((l, i) => (
        <p key={i} className="whitespace-pre-line break-words">{l}</p>
      ))}
    </div>
  );
}
