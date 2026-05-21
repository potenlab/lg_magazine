"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Lets the 0-5-2 corner-controls hint scene tell the always-mounted corner
// buttons (기록 panel / 음량 control) to pulse while the matching hint page
// is on screen. null = nothing highlighted.
export type CornerHint = "record" | "volume" | null;

const CornerHintContext = createContext<{
  hint: CornerHint;
  setHint: (h: CornerHint) => void;
}>({ hint: null, setHint: () => {} });

export function CornerHintProvider({ children }: { children: ReactNode }) {
  const [hint, setHint] = useState<CornerHint>(null);
  const value = useMemo(() => ({ hint, setHint }), [hint]);
  return <CornerHintContext.Provider value={value}>{children}</CornerHintContext.Provider>;
}

export function useCornerHint() {
  return useContext(CornerHintContext);
}
