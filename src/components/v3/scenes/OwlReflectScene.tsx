"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NavText } from "@/components/v3/ui/NavText";
import { useV3Session } from "@/components/v3/context/V3SessionContext";
import { llm } from "@/lib/v3/llm";
import { useEditorWait } from "@/lib/v3/useEditorWait";
import { useEnterToAdvance } from "@/lib/v3/useEnterToAdvance";
import type { SceneSpec, SceneId } from "@/lib/v3/scenes/types";

export function OwlReflectScene({
  spec,
  onAdvance,
}: {
  spec: SceneSpec;
  onAdvance: (n: SceneId) => void;
}) {
  const { session } = useV3Session();
  const [text, setText] = useState<string | null>(null);
  const waitMsg = useEditorWait();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const answer = spec.reflectInputField
        ? String(session[spec.reflectInputField] ?? "")
        : "";
      try {
        if (spec.reflectTask === "comfortReassure") {
          const r = await llm.comfortReassure({ answer, name: session.name });
          if (!cancelled) setText(r);
        }
      } catch {
        if (!cancelled) {
          setText("괜찮습니다. 이 객실에 머무는 동안 자연스럽게 익숙해지실 거예요.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  const advance = () => {
    if (typeof spec.next === "string") onAdvance(spec.next);
    else if (typeof spec.next === "function") onAdvance(spec.next(session));
  };
  useEnterToAdvance(advance, Boolean(text));

  if (!text) {
    return <p className="italic text-[#8b7050]">{waitMsg}</p>;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="leading-[1.6] text-[#3d2414]"
          style={{ textWrap: "pretty" } as React.CSSProperties}
        >
          {text}
        </motion.p>
      </div>
      {/* 다음 — text-style nav (matches "이전" baseline) instead of
          full button. owlReflect is a narration beat with no commitment,
          so the lightweight italic nav reads more naturally than a
          primary action button. Absolute-anchored to mirror 이전. */}
      <div className="absolute bottom-6 right-6 z-10 flex h-[44px] items-center">
        <NavText label={spec.buttonLabel ?? "다음"} onClick={advance} />
      </div>
    </div>
  );
}
