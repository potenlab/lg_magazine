"use client";

// /claude — LLM mode: 전체 Anthropic.
// realLLM.callTask가 pathname에서 "claude"를 읽어 x-llm-mode 헤더로 전달한다.

import dynamic from "next/dynamic";
import { BGMProvider } from "@/components/v3/context/BGMContext";

const V3App = dynamic(() => import("@/components/v3/V3App"), { ssr: false });

export default function ClaudePage() {
  return (
    <BGMProvider>
      <V3App />
    </BGMProvider>
  );
}
