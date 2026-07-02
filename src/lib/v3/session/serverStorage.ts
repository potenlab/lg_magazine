// Server-side storage for v3 sessions — MSSQL (production branch).
//
// This is the MSSQL drop-in replacement for the Supabase/PostgREST version that
// lives on `main`. It keeps the EXACT same exported signatures so that
// `src/app/api/v3/sessions/route.ts` and the admin page never need to change:
//   - upsertV3Session(session)        → MERGE on session_id
//   - listV3Sessions()                → SELECT TOP 200 ... ORDER BY updated_at DESC
//   - deleteV3Sessions()              → DELETE all
//   - deleteV3Session(sessionId)      → DELETE one
//   - isMssqlConfigured()             → renamed from main's isSupabaseConfigured
//
// The `data` JSONB column on Postgres becomes NVARCHAR(MAX) holding JSON text;
// we JSON.stringify on write and JSON.parse on read.
//
// Env vars (set in .env on the server):
//   MSSQL_SERVER, MSSQL_PORT(=1433), MSSQL_DATABASE, MSSQL_USER, MSSQL_PASSWORD,
//   MSSQL_ENCRYPT(=true), MSSQL_TRUST_SERVER_CERT(=true)
//
// Schema: supabase/migrations/v3_sessions.mssql.sql

import sql from "mssql";
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
  data: string; // NVARCHAR(MAX) JSON
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

/** True when the MSSQL env vars are present. Route handlers check this first and
 * silently no-op when false. Renamed from main's `isSupabaseConfigured`; the
 * import in `route.ts` is rewritten to match during /sync-main. */
export function isMssqlConfigured(): boolean {
  return Boolean(
    process.env.MSSQL_SERVER &&
      process.env.MSSQL_DATABASE &&
      process.env.MSSQL_USER &&
      process.env.MSSQL_PASSWORD,
  );
}

function getConfig(): sql.config {
  const server = process.env.MSSQL_SERVER;
  const database = process.env.MSSQL_DATABASE;
  const user = process.env.MSSQL_USER;
  const password = process.env.MSSQL_PASSWORD;
  if (!server || !database || !user || !password) {
    throw new Error(
      "MSSQL env vars are missing (MSSQL_SERVER / MSSQL_DATABASE / MSSQL_USER / MSSQL_PASSWORD)",
    );
  }
  return {
    server,
    database,
    user,
    password,
    port: Number(process.env.MSSQL_PORT || 1433),
    options: {
      encrypt: (process.env.MSSQL_ENCRYPT ?? "true") !== "false",
      trustServerCertificate:
        (process.env.MSSQL_TRUST_SERVER_CERT ?? "true") !== "false",
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

// Lazy singleton pool — survives across requests in the long-lived Node server.
// Exported so other MSSQL call sites (e.g. src/lib/admin/cohortRules.ts) share it.
let poolPromise: Promise<sql.ConnectionPool> | null = null;
export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(getConfig()).connect().catch((err) => {
      poolPromise = null; // allow retry on next call
      throw err;
    });
  }
  return poolPromise;
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: V3SessionRow): V3SessionRecord {
  return {
    sessionId: row.session_id,
    userName: row.user_name,
    job: row.job,
    lastSceneId: row.last_scene_id,
    status: row.status,
    data: typeof row.data === "string" ? (JSON.parse(row.data) as V3Session) : row.data,
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
    completedAt: iso(row.completed_at),
  };
}

/** Heuristic for "this run looks done" — used when client doesn't pass an
 * explicit status. (Identical to the Supabase version.) */
function inferStatus(s: V3Session): "in_progress" | "completed" {
  const hasArticles = Object.keys(s.chapterArticles ?? {}).length >= 4;
  const hasVision = (s.visionLine ?? "").trim().length > 0;
  return hasArticles && hasVision ? "completed" : "in_progress";
}

export async function upsertV3Session(session: V3Session): Promise<V3SessionRecord> {
  if (!session.sessionId) {
    throw new Error("upsertV3Session: session.sessionId is required");
  }
  const now = new Date();
  const status = inferStatus(session);
  const pool = await getPool();

  const result = await pool
    .request()
    .input("session_id", sql.NVarChar(255), session.sessionId)
    .input("user_name", sql.NVarChar(255), session.name || null)
    .input("job", sql.NVarChar(255), session.job || null)
    .input("last_scene_id", sql.NVarChar(255), session.lastSceneId || null)
    .input("status", sql.NVarChar(20), status)
    .input("data", sql.NVarChar(sql.MAX), JSON.stringify(session))
    .input("updated_at", sql.DateTime2, now)
    .input("completed_at", sql.DateTime2, status === "completed" ? now : null)
    .query(`
      MERGE ${TABLE} WITH (HOLDLOCK) AS target
      USING (SELECT @session_id AS session_id) AS src
        ON target.session_id = src.session_id
      WHEN MATCHED THEN UPDATE SET
        user_name = @user_name, job = @job, last_scene_id = @last_scene_id,
        status = @status, data = @data, updated_at = @updated_at,
        completed_at = @completed_at
      WHEN NOT MATCHED THEN INSERT
        (session_id, user_name, job, last_scene_id, status, data, completed_at)
        VALUES (@session_id, @user_name, @job, @last_scene_id, @status, @data, @completed_at)
      OUTPUT inserted.id, inserted.session_id, inserted.user_name, inserted.job,
             inserted.last_scene_id, inserted.status, inserted.data,
             inserted.created_at, inserted.updated_at, inserted.completed_at;
    `);

  return mapRow(result.recordset[0] as V3SessionRow);
}

export async function listV3Sessions(): Promise<V3SessionRecord[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT TOP 200 * FROM ${TABLE} ORDER BY updated_at DESC`);
  return (result.recordset as V3SessionRow[]).map(mapRow);
}

export async function deleteV3Sessions(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`DELETE FROM ${TABLE}`);
}

export async function deleteV3Session(sessionId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("session_id", sql.NVarChar(255), sessionId)
    .query(`DELETE FROM ${TABLE} WHERE session_id = @session_id`);
}
