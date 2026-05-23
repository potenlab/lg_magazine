// Server-side storage for v3 sessions — Supabase upsert/list/delete.
// Mirrors the v2 supabaseSubmissions.ts pattern but on a separate table so
// v2/v3 schemas stay cleanly isolated.
//
// Table: v3_sessions  (see supabase/migrations/v3_sessions.sql)
//   session_id      TEXT UNIQUE NOT NULL
//   user_name       TEXT
//   job             TEXT
//   last_scene_id   TEXT
//   status          TEXT NOT NULL DEFAULT 'in_progress'
//   data            JSONB NOT NULL    -- the full V3Session blob
//   created_at      TIMESTAMPTZ DEFAULT NOW()
//   updated_at      TIMESTAMPTZ DEFAULT NOW()
//   completed_at    TIMESTAMPTZ

import type { V3Session } from "@/lib/v3/scenes/types";

const TABLE = "v3_sessions";

export interface V3SessionRecord {
  sessionId: string;
  userName: string | null;
  job: string | null;
  lastSceneId: string | null;
  status: "in_progress" | "completed";
  data: V3Session;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface V3SessionRow {
  id: string;
  session_id: string;
  user_name: string | null;
  job: string | null;
  last_scene_id: string | null;
  status: "in_progress" | "completed";
  data: V3Session;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** True when both Supabase env vars are present. Route handlers should check
 * this first and silently no-op when false, so deployments that don't use
 * Supabase don't spam logs with errors on every fire-and-forget client save. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars are missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const { url, key } = getConfig();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  return res;
}

function mapRow(row: V3SessionRow): V3SessionRecord {
  return {
    sessionId: row.session_id,
    userName: row.user_name,
    job: row.job,
    lastSceneId: row.last_scene_id,
    status: row.status,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/** Heuristic for "this run looks done" — used when client doesn't pass an
 * explicit status. Magazine handoff is the last scene group, so any cached
 * chapter article + a non-empty visionLine is a strong completion signal. */
function inferStatus(s: V3Session): "in_progress" | "completed" {
  const hasArticles = Object.keys(s.chapterArticles ?? {}).length >= 4;
  const hasVision = (s.visionLine ?? "").trim().length > 0;
  return hasArticles && hasVision ? "completed" : "in_progress";
}

export async function upsertV3Session(session: V3Session): Promise<V3SessionRecord> {
  if (!session.sessionId) {
    throw new Error("upsertV3Session: session.sessionId is required");
  }
  const now = new Date().toISOString();
  const status = inferStatus(session);
  const payload = {
    session_id: session.sessionId,
    user_name: session.name || null,
    job: session.job || null,
    last_scene_id: session.lastSceneId || null,
    status,
    data: session,
    updated_at: now,
    completed_at: status === "completed" ? now : null,
  };

  const res = await supabaseFetch(`${TABLE}?on_conflict=session_id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const rows = (await res.json()) as V3SessionRow[];
  return mapRow(rows[0]);
}

export async function listV3Sessions(): Promise<V3SessionRecord[]> {
  const res = await supabaseFetch(`${TABLE}?select=*&order=updated_at.desc&limit=200`);
  const rows = (await res.json()) as V3SessionRow[];
  return rows.map(mapRow);
}

export async function deleteV3Sessions(): Promise<void> {
  await supabaseFetch(`${TABLE}?session_id=not.is.null`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}
