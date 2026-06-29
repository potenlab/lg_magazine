"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { EMPTY_V3_SESSION, type SceneId, type V3Session } from "@/lib/v3/scenes/types";
import { clearSession, generateSessionId, loadSession, saveSession } from "@/lib/v3/session/storage";

type Action =
  | { type: "hydrate"; payload: V3Session }
  | { type: "patch"; payload: Partial<V3Session> }
  | { type: "goto"; payload: SceneId }
  | { type: "incrementFollowup"; payload: SceneId }
  | { type: "reset" };

function reducer(state: V3Session, action: Action): V3Session {
  switch (action.type) {
    case "hydrate":
      return action.payload;
    case "patch":
      return { ...state, ...action.payload };
    case "goto":
      return { ...state, lastSceneId: action.payload };
    case "incrementFollowup": {
      const id = action.payload;
      const next = (state.followupCounts[id] ?? 0) + 1;
      return { ...state, followupCounts: { ...state.followupCounts, [id]: next } };
    }
    case "reset":
      return {
        ...EMPTY_V3_SESSION,
        sessionId: generateSessionId(),
        startedAt: new Date().toISOString(),
      };
    default:
      return state;
  }
}

/** Lazy initializer — runs once on mount, never inside an effect.
 * Mints a sessionId on first run (also backfills one for sessions that
 * were saved before the sessionId field existed). */
function initSession(): V3Session {
  const loaded = loadSession();
  if (loaded) {
    if (!loaded.sessionId) loaded.sessionId = generateSessionId();
    return loaded;
  }
  return {
    ...EMPTY_V3_SESSION,
    sessionId: generateSessionId(),
    startedAt: new Date().toISOString(),
  };
}

/** Fire-and-forget POST to /api/v3/sessions. Failures are logged but never
 * thrown — local play must continue even if MSSQL is down. */
async function syncToServer(session: V3Session): Promise<void> {
  if (!session.sessionId) return;
  try {
    await fetch("/api/v3/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
      keepalive: true, // survives tab close mid-flight
    });
  } catch (err) {
    console.warn("[v3] session sync failed:", err);
  }
}

interface V3SessionContextValue {
  session: V3Session;
  patch: (partial: Partial<V3Session>) => void;
  goto: (sceneId: SceneId) => void;
  incrementFollowup: (sceneId: SceneId) => void;
  reset: () => void;
  hydrated: boolean;
}

const Ctx = createContext<V3SessionContextValue | null>(null);

export function V3SessionProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(reducer, undefined, initSession);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save — session is always initialized by the time this runs.
  // localStorage write is immediate-ish (300ms); server sync runs at a longer
  // 1.5s debounce so a flurry of patches during a typed-in answer doesn't
  // hammer MSSQL. The two timers are independent so localStorage stays
  // up to date even if the network is slow.
  const serverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (serverTimer.current) clearTimeout(serverTimer.current);
    timer.current = setTimeout(() => saveSession(session), 300);
    serverTimer.current = setTimeout(() => syncToServer(session), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (serverTimer.current) clearTimeout(serverTimer.current);
    };
  }, [session]);

  const patch = useCallback((partial: Partial<V3Session>) => {
    dispatch({ type: "patch", payload: partial });
  }, []);
  const goto = useCallback((sceneId: SceneId) => {
    dispatch({ type: "goto", payload: sceneId });
  }, []);
  const incrementFollowup = useCallback((sceneId: SceneId) => {
    dispatch({ type: "incrementFollowup", payload: sceneId });
  }, []);
  const reset = useCallback(() => {
    clearSession();
    dispatch({ type: "reset" });
  }, []);

  const value = useMemo<V3SessionContextValue>(
    () => ({ session, patch, goto, incrementFollowup, reset, hydrated: true }),
    [session, patch, goto, incrementFollowup, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useV3Session(): V3SessionContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV3Session must be used inside V3SessionProvider");
  return v;
}
