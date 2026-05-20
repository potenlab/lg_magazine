"use client";

// /mix — LLM mode: 평소 챕터 진행은 Gemini, 종합(2-10/3-10)만 Anthropic.
// realLLM.callTask가 pathname에서 "mix"를 읽어 x-llm-mode 헤더로 전달한다.

import dynamic from "next/dynamic";
import { BGMProvider } from "@/components/v3/context/BGMContext";

const V3App = dynamic(() => import("@/components/v3/V3App"), { ssr: false });

export default function MixPage() {
  return (
    <BGMProvider>
      <V3App />
    </BGMProvider>
  );
}
