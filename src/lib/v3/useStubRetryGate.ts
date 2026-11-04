"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Holds back canned fallback text when an AI call fails.
 *
 * Without this, a failed call silently showed the same generic sentences to
 * everyone, which participants read as "the owl ignores what I wrote". Now the
 * scene shows a retry notice first. After one manual retry the participant may
 * also continue with the basic text, so nobody gets stuck if the AI stays down.
 *
 * Usage in a scene:
 *   const gate = useStubRetryGate();
 *   useEffect(() => { ...; if (r.fromStub && gate.hold(() => apply(r))) return; apply(r); }, [gate.attempt]);
 *   if (gate.blocked) return <LlmRetryNotice gate={gate} name={session.name} />;
 */
export function useStubRetryGate() {
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const heldRef = useRef<(() => void) | null>(null);

  /** Park the fallback. Returns true when the caller should stop and wait. */
  const hold = useCallback((applyFallback: () => void): boolean => {
    heldRef.current = applyFallback;
    setBlocked(true);
    return true;
  }, []);

  /** Ask the scene to call the AI again (scene effects depend on `attempt`). */
  const retry = useCallback(() => {
    heldRef.current = null;
    setBlocked(false);
    setAttempt((a) => a + 1);
  }, []);

  /** Give up on the AI for this scene and show the basic text. */
  const proceed = useCallback(() => {
    const apply = heldRef.current;
    heldRef.current = null;
    setBlocked(false);
    apply?.();
  }, []);

  return { attempt, blocked, hold, retry, proceed, canProceed: attempt >= 1 };
}

export type StubRetryGate = ReturnType<typeof useStubRetryGate>;
