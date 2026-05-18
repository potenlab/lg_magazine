import type { SceneId, SceneSpec } from "./types";
import { CH0_SCENES } from "./ch0";
import { CH1_SCENES } from "./ch1";
import { CH2_SCENES } from "./ch2";
import { CH3_SCENES } from "./ch3";
import { CH4_SCENES } from "./ch4";
import { CLOSING_SCENES } from "./closing";

const INTRO: SceneSpec = {
  id: "intro",
  chapter: 0,
  kind: "intro",
  owl: "welcoming",
  timeOfDay: "preBoard",
  next: "0-1",
};

const ALL: SceneSpec[] = [
  INTRO,
  ...CH0_SCENES,
  ...CH1_SCENES,
  ...CH2_SCENES,
  ...CH3_SCENES,
  ...CH4_SCENES,
  ...CLOSING_SCENES,
];

export const SCENES: Record<SceneId, SceneSpec> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);
export const SCENE_ORDER: SceneId[] = ALL.map((s) => s.id);

// Reverse map: scene id → ids of scenes whose `next` (or branch.next /
// choice.next) leads to it. Used as a fallback for the "이전" button when
// prevStack is empty (e.g. after a fresh page load before any forward
// navigation has happened — the in-memory prevStack starts empty and
// localStorage persistence only kicks in once the user advances at least
// one scene). Only static string targets are recorded; function-typed
// `next` (judge-based followups) can't be reversed and will simply not
// have a fallback predecessor.
export const SCENE_PREDECESSORS: Record<SceneId, SceneId[]> = (() => {
  const map: Record<string, Set<SceneId>> = {};
  for (const s of ALL) {
    const targets: string[] = [];
    if (typeof s.next === "string") targets.push(s.next);
    if (s.branches) {
      for (const b of Object.values(s.branches)) {
        if (b && typeof b === "object" && "next" in b && typeof b.next === "string") {
          targets.push(b.next);
        }
      }
    }
    if (s.choices) {
      for (const c of s.choices) {
        if (typeof c.next === "string") targets.push(c.next);
      }
    }
    for (const t of targets) {
      if (!map[t]) map[t] = new Set();
      map[t].add(s.id);
    }
  }
  const out: Record<string, SceneId[]> = {};
  for (const [k, v] of Object.entries(map)) out[k] = Array.from(v);
  return out as Record<SceneId, SceneId[]>;
})();

// Integrity check at module load — crashes Next dev if graph is broken.
if (process.env.NODE_ENV !== "production") {
  const ids = new Set(SCENE_ORDER);
  for (const s of ALL) {
    if (typeof s.next === "string" && !ids.has(s.next) && s.id !== "C-4") {
      throw new Error(`Scene ${s.id}.next → "${s.next}" is unknown`);
    }
    if (s.branches) {
      for (const [key, b] of Object.entries(s.branches)) {
        if (b?.next && !ids.has(b.next)) {
          throw new Error(`Scene ${s.id}.branches.${key}.next → "${b.next}" is unknown`);
        }
      }
    }
    if (s.kind === "followup" && !s.parentSaveTo) {
      throw new Error(`Followup ${s.id} missing parentSaveTo`);
    }
  }
}
