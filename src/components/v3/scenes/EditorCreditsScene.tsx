"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { StoryButtonV3 } from "@/components/v3/ui/StoryButtonV3";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { DialogStageContext } from "@/components/v3/V3App";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

const PER_LINE_REVEAL_MS = 2400;

/**
 * Closing-scene end credits. Fetches the LLM "outro" editor's note, splits
 * it on blank lines, and slow-fades each line in like film credits. Once
 * all lines have settled the "이제 내릴게요" button appears so the user
 * can deboard the train.
 */
export function EditorCreditsScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session } = useV3Session();
  const { setStage } = useContext(DialogStageContext);
  const [note, setNote] = useState<string | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setStage("content");
  }, [setStage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await llm.writeEditorNote({ session, kind: "outro" });
        if (!cancelled) setNote(r);
      } catch (err) {
        console.error("[v3] editor outro fetch failed:", err);
        if (!cancelled) {
          // Graceful fallback so the closing isn't blocked on a transient API blip.
          setNote(
            `우리는 묵묵히 자기 빛을 쌓아온 한 사람을 만났다.\n\n${session.gender}의 이야기를 들으며, 우리는 ${session.gender}가 이미 자기만의 답을 가지고 있음을 깨달았다.\n\n이 한 호가 ${session.gender}의 다음 여정에 작은 등불이 되기를.`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const lines = useMemo(
    () =>
      note
        ? note
            .split(/\n\s*\n+/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
        : [],
    [note],
  );

  useEffect(() => {
    if (shown >= lines.length) return;
    const t = setTimeout(
      () => setShown((s) => Math.min(s + 1, lines.length)),
      shown === 0 ? 600 : PER_LINE_REVEAL_MS,
    );
    return () => clearTimeout(t);
  }, [shown, lines.length]);

  const settled = note !== null && shown >= lines.length && lines.length > 0;

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };

  return (
    <div className="flex flex-1 flex-col items-center px-2 py-4 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {spec.narration && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="text-[16px] italic tracking-[0.04em] text-[#8b7050] md:text-[16px]"
            style={{ fontFamily: "var(--font-ridi-batang), serif" }}
          >
            {spec.narration}
          </motion.p>
        )}
        <p className="text-[16px] uppercase tracking-[0.42em] text-[#7a5a3a]">
          From the Editor
        </p>
        <div className="flex items-center gap-3">
          <div className="h-px w-8 bg-[#b99b6b]/55" />
          <span
            className="text-[16px] tracking-[0.28em] text-[#7a5a3a]"
            style={{ fontFamily: "var(--font-ridi-batang), serif" }}
          >
            Editor&rsquo;s Note
          </span>
          <div className="h-px w-8 bg-[#b99b6b]/55" />
        </div>

        <div className="max-w-[520px] space-y-6 px-4">
          {lines.slice(0, shown).map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
              className="text-[16px] italic leading-[1.95] text-[#3d2414] md:text-[18px]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              {line}
            </motion.p>
          ))}
        </div>

        {settled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.4 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="h-px w-12 bg-[#b99b6b]/55" />
            <p className="text-[16px] uppercase tracking-[0.4em] text-[#7a5a3a]">
              Magazine STORY · Vol. {session.name}
            </p>
            <p
              className="text-[16px] italic text-[#8b7050]"
              style={{ fontFamily: "var(--font-ridi-batang), serif" }}
            >
              오직 한 사람을 위한 단 한 호의 매거진
            </p>
          </motion.div>
        )}
      </div>

      <div className="mt-6 flex w-full justify-center">
        {settled && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <StoryButtonV3
              label={spec.buttonLabel ?? "이제 내릴게요"}
              onClick={advance}
              ritual
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
