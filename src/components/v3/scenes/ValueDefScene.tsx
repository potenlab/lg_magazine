"use client";

import { useState } from "react";
import { Reorder, motion } from "framer-motion";
import { AutoFlowText } from "@/components/v3/ui/AutoFlowText";
import { NarrationBlock } from "@/components/v3/ui/NarrationBlock";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { renderTemplate } from "@/lib/v3/scenes/template";
import { VALUE_CARD_CATEGORIES, type ValueCardCategory } from "@/lib/v3/valueCards";
import type { SceneSpec, SceneId, V3Session } from "@/lib/v3/scenes/types";

const CATEGORY_BY_VALUE: Map<string, ValueCardCategory> = (() => {
  const m = new Map<string, ValueCardCategory>();
  for (const cat of VALUE_CARD_CATEGORIES) {
    for (const c of cat.cards) m.set(c, cat);
  }
  return m;
})();

const RANK_LABEL = ["1순위", "2순위", "3순위"] as const;

/**
 * Value priority scene — drag-to-reorder the selected value cards.
 * Leftmost = topValue. Cards visually match the selection-grid style;
 * a drag-handle row + wiggle-on-mount hint at draggability.
 */
export function ValueDefScene({ spec, onAdvance }: { spec: SceneSpec; onAdvance: (n: SceneId) => void }) {
  const { session, patch } = useV3Session();
  const [order, setOrder] = useState<string[]>(
    session.selectedValues.length > 0 ? session.selectedValues : [],
  );
  const [settled, setSettled] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const lines = (spec.lines ?? []).map((l) => renderTemplate(l, session));
  const narration = spec.narration ? renderTemplate(spec.narration, session) : undefined;

  const submit = () => {
    if (order.length === 0) return;
    patch({
      selectedValues: order,
      topValue: order[0],
    } as Partial<V3Session>);
    if (typeof spec.next === "string") onAdvance(spec.next);
  };

  const isMulti = order.length > 1;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5">
        {narration && <NarrationBlock text={narration} />}
        <AutoFlowText lines={lines} onSettled={() => setSettled(true)} />
        {settled && (
          <>
            {isMulti && !hasDragged && (
              <div className="flex items-center justify-center gap-2 text-[16px] text-[#8b7050]">
                <motion.span
                  animate={{ x: [-3, 3, -3, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="text-base"
                >
                  ⇆
                </motion.span>
                <span className="italic">카드를 좌우로 드래그해서 순서를 정해주세요</span>
              </div>
            )}
            {!isMulti && (
              <p className="text-center text-[16px] italic text-[#8b7050]">
                선택하신 단어가 {session.name}님의 1순위 가치예요.
              </p>
            )}

            <Reorder.Group
              axis="x"
              values={order}
              onReorder={(o) => {
                setOrder(o);
                setHasDragged(true);
              }}
              className="flex flex-wrap items-stretch justify-center gap-4 select-none"
            >
              {order.map((v, i) => {
                const cat = CATEGORY_BY_VALUE.get(v);
                const isTop = i === 0;
                return (
                  <Reorder.Item
                    key={v}
                    value={v}
                    dragListener={isMulti}
                    className={`relative ${isMulti ? "cursor-grab active:cursor-grabbing" : ""}`}
                    whileDrag={{ scale: 1.06, zIndex: 20, rotate: -1 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={
                      isMulti && !hasDragged
                        ? {
                            opacity: 1,
                            y: 0,
                            x: [0, -4, 4, -2, 0],
                          }
                        : { opacity: 1, y: 0 }
                    }
                    transition={
                      isMulti && !hasDragged
                        ? {
                            opacity: { duration: 0.4, delay: i * 0.1 },
                            y: { duration: 0.4, delay: i * 0.1 },
                            x: {
                              delay: 1.0 + i * 0.15,
                              duration: 0.8,
                              ease: "easeInOut",
                            },
                          }
                        : { duration: 0.4 }
                    }
                  >
                    <div
                      className={`flex w-[140px] flex-col items-center gap-1.5 rounded-md border-2 px-3 py-4 text-center transition ${
                        isTop
                          ? "border-[#3d2414] bg-[#3d2414] text-[#f5ead6] shadow-lg"
                          : "border-[#b99b6b]/50 bg-white/70 text-[#3d2414] shadow-sm"
                      }`}
                    >
                      {/* drag handle row */}
                      {isMulti && (
                        <span
                          className={`text-[16px] leading-none ${
                            isTop ? "text-[#d4a54a]" : "text-[#b99b6b]"
                          }`}
                          aria-hidden
                        >
                          ⋮⋮
                        </span>
                      )}
                      {cat && (
                        <span
                          className={`text-[16px] tracking-wide ${
                            isTop ? "text-[#f5ead6]/75" : "text-[#8b7050]"
                          }`}
                        >
                          <span className="mr-0.5">{cat.emoji}</span>
                          {cat.label}
                        </span>
                      )}
                      <span className="text-[18px] font-medium md:text-[18px]">{v}</span>
                    </div>

                    {/* rank badge */}
                    <span
                      className={`absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[16px] font-medium tracking-wide shadow-sm ${
                        isTop
                          ? "bg-[#d4a54a] text-[#3d2414]"
                          : "bg-white text-[#5a4a38] ring-1 ring-[#b99b6b]/40"
                      }`}
                    >
                      {RANK_LABEL[i] ?? `${i + 1}순위`}
                    </span>
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </>
        )}
      </div>
      <div
        className={`mt-auto flex justify-end transition-opacity duration-500 ${
          settled ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <StoryButtonV3
          label={spec.buttonLabel ?? "이렇게 정해볼게요"}
          onClick={submit}
          disabled={order.length === 0}
        />
      </div>
    </div>
  );
}
