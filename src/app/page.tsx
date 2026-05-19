"use client";

import dynamic from "next/dynamic";
import { BGMProvider } from "@/components/v3/context/BGMContext";

const V3App = dynamic(() => import("@/components/v3/V3App"), { ssr: false });

export default function RootPage() {
  return (
    <BGMProvider>
      <V3App />
    </BGMProvider>
  );
}
