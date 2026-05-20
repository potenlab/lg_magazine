"use client";

// /mix_deep — 챕터=Gemini, 종합=Claude + Deep 모드 (3문단 적극 해석).
// realLLM.callTask가 pathname에서 "mix_deep"을 읽어 mode=mix + deep=true로 전달한다.

import dynamic from "next/dynamic";
import { BGMProvider } from "@/components/v3/context/BGMContext";

const V3App = dynamic(() => import("@/components/v3/V3App"), { ssr: false });

export default function MixDeepPage() {
  return (
    <BGMProvider>
      <V3App />
    </BGMProvider>
  );
}
