// Server-side storage for v3 sessions — Supabase upsert/list/delete.
// Mirrors the v2 supabaseSubmissions.ts pattern but on a separate table so
// v2/v3 schemas stay cleanly isolated.
//
// Table: v3_sessions  (see supabase/migrations/v3_sessions.sql
//                       + v3_sessions_userid.sql for the W5.2 owner column)
//   session_id      TEXT UNIQUE NOT NULL
//   userid          TEXT              -- W5.2 세션 소유자 (qrius userid)
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
  userid: string | null;
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
  userid: string | null;
  user_name: string | null;
  job: string | null;
  last_scene_id: string | null;
  status: "in_progress" | "completed";
  data: V3Session;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** W5.2: 다른 사용자가 소유한 sessionId 로의 upsert 시도. Route 에서 403 으로 변환. */
export class SessionOwnershipError extends Error {
  constructor(sessionId: string) {
    super(`session ${sessionId} is owned by another user`);
    this.name = "SessionOwnershipError";
  }
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

export async function supabaseFetch(path: string, init: RequestInit = {}) {
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
    userid: row.userid ?? null,
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

export async function upsertV3Session(
  session: V3Session,
  userid: string | null,
): Promise<V3SessionRecord> {
  if (!session.sessionId) {
    throw new Error("upsertV3Session: session.sessionId is required");
  }

  // W5.2: 소유권 가드. PostgREST 의 merge-duplicates upsert 는 MSSQL MERGE 처럼
  // 기존 행 조건부 갱신이 안 되므로, 먼저 소유자를 읽어 확인한다. 기존 userid 가
  // 있고 요청자와 다르면 거부. 요청자 userid 가 null(시크릿 미설정 프리뷰)이면
  // 소유권 검사를 건너뛰되 기존 소유자 값을 덮어쓰지 않는다.
  // ponytail: read-then-write 라 미세한 TOCTOU 창이 있으나, 재검증 대상인 LG
  // production(MSSQL)은 MERGE 로 원자적. Vercel/Supabase 측 잔여 리스크는 무시 가능.
  const enc = encodeURIComponent(session.sessionId);
  let owner: string | null = null;
  {
    const res = await supabaseFetch(`${TABLE}?select=userid&session_id=eq.${enc}`);
    const rows = (await res.json()) as Array<{ userid: string | null }>;
    owner = rows[0]?.userid ?? null;
    if (userid && owner && owner !== userid) {
      throw new SessionOwnershipError(session.sessionId);
    }
  }

  const now = new Date().toISOString();
  const status = inferStatus(session);
  const payload = {
    session_id: session.sessionId,
    // 요청자 userid 가 있으면 소유자로 도장, 없으면 기존 소유자 유지.
    userid: userid ?? owner,
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

export async function deleteV3Session(sessionId: string): Promise<void> {
  const encoded = encodeURIComponent(sessionId);
  await supabaseFetch(`${TABLE}?session_id=eq.${encoded}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}
