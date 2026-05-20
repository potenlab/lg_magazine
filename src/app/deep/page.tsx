"use client";

// /deep — 기본 LLM (.env LLM_PROVIDER, 현재 Claude) + Deep 모드 (3문단 적극 해석).
// realLLM.callTask가 pathname에서 "deep"을 읽어 x-llm-deep 헤더로 전달한다.

import dynamic from "next/dynamic";
import { BGMProvider } from "@/components/v3/context/BGMContext";

const V3App = dynamic(() => import("@/components/v3/V3App"), { ssr: false });

export default function DeepPage() {
  return (
    <BGMProvider>
      <V3App />
    </BGMProvider>
  );
}
