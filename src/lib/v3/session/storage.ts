import { EMPTY_V3_SESSION, type V3Session, type SceneId } from "@/lib/v3/scenes/types";
import { SCENES } from "@/lib/v3/scenes";

// Bumped to v3 (2026-05-10) to wipe sessions that got stuck on now-removed
// scene ids (e.g. legacy 2-3a) or earlier C-4 self-loop. Old v2 entries are
// ignored — users start fresh at intro.
const KEY = "lg_story_v3_session_v3";
const LEGACY_KEYS = ["lg_story_v3_session_v2"];

export function loadSession(): V3Session | null {
  if (typeof window === "undefined") return null;
  // Clear any prior schema's leftovers so they can't shadow the new one.
  for (const k of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3Session;
    if (parsed.schemaVersion !== 2) return null;
    // Defensive: if lastSceneId points to a scene that no longer exists in
    // the current SCENES graph (script edits between sessions), treat the
    // saved session as invalid and start fresh — prevents the app from
    // rendering "Scene not found" or crashing during resume.
    const id = parsed.lastSceneId;
    if (id && id !== "intro" && !SCENES[id]) {
      console.warn(`[v3] Discarding stale session at unknown scene: ${id}`);
      return null;
    }
    return { ...EMPTY_V3_SESSION, ...parsed };
  } catch {
    return null;
  }
}

export function saveSession(session: V3Session): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota or serialization error — silently drop, session continues in memory */
  }
}

/** Generate a stable per-run sessionId. Uses crypto.randomUUID when
 * available (modern browsers + Node 19+); falls back to a Math.random
 * composite that's good enough as an upsert key for pilot data. */
export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function hasResumableSession(): SceneId | null {
  const s = loadSession();
  if (!s) return null;
  if (s.lastSceneId === "intro" || s.lastSceneId === "C-4") return null;
  return s.lastSceneId;
}
