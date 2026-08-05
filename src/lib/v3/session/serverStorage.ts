// Server-side storage for v3 sessions — MSSQL (production branch).
//
// This is the MSSQL drop-in replacement for the Supabase/PostgREST version that
// lives on `main`. It keeps the EXACT same exported signatures so that
// `src/app/api/v3/sessions/route.ts` and the admin page never need to change:
//   - upsertV3Session(session, userid) → MERGE on session_id (owner-guarded, W5.2)
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
// Schema: supabase/migrations/v3_sessions.mssql.sql (+ v3_sessions_userid.mssql.sql)

import sql from "mssql";
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
  data: string; // NVARCHAR(MAX) JSON
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

/** W5.2: 다른 사용자가 소유한 sessionId 로의 upsert 시도. Route 에서 403 으로 변환. */
export class SessionOwnershipError extends Error {
  constructor(sessionId: string) {
    super(`session ${sessionId} is owned by another user`);
    this.name = "SessionOwnershipError";
  }
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
    userid: row.userid ?? null,
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

export async function upsertV3Session(
  session: V3Session,
  userid: string | null,
): Promise<V3SessionRecord> {
  if (!session.sessionId) {
    throw new Error("upsertV3Session: session.sessionId is required");
  }
  const now = new Date();
  const status = inferStatus(session);
  const pool = await getPool();

  // W5.2: 소유권 가드 — 기존 행의 userid 가 NULL(레거시)이면 이번 요청자가
  // 소유권을 가져가고, 다른 사용자 소유면 UPDATE 분기가 실행되지 않아
  // OUTPUT 이 빈 결과 → SessionOwnershipError. @userid 가 NULL 인 경우
  // (시크릿 미설정 프리뷰 env)는 기존 동작 유지하되 소유자는 바꾸지 않는다.
  const result = await pool
    .request()
    .input("session_id", sql.NVarChar(255), session.sessionId)
    .input("userid", sql.NVarChar(255), userid)
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
      -- anon-* 는 신원이 아니라 브라우저 쿠키 단위 임시 식별자다. 쿠키가 만료·삭제되면
      -- 같은 사람도 새 anon id 를 받는데, 소유권으로 막으면 본인 세션인데도 저장이
      -- 403 으로 조용히 실패한다. 실제 LG 계정 id 에 대해서만 막는다. (main 과 동일)
      WHEN MATCHED AND (target.userid IS NULL OR @userid IS NULL OR target.userid = @userid
                        OR target.userid LIKE 'anon-%')
        THEN UPDATE SET
        userid = COALESCE(@userid, target.userid),
        user_name = @user_name, job = @job, last_scene_id = @last_scene_id,
        status = @status, data = @data,
        -- 내용이 그대로면 updated_at 을 올리지 않는다. 클라이언트도 같은 payload 는
        -- 안 보내도록 고쳤지만(main 과 공통), 캐시된 옛 번들을 띄워둔 탭은 여전히
        -- 마운트 직후 저장을 보낸다 — 그때 어드민 "소요시간"(진행중 =
        -- updated_at - created_at)이 부풀지 않도록 서버에서도 막는다.
        -- ponytail: nvarchar(max) 통짜 비교 — 행이 만 단위면 해시 컬럼으로 전환.
        updated_at = CASE WHEN target.data = @data THEN target.updated_at ELSE @updated_at END,
        -- 완료 시각은 최초 1회만 찍는다. 완료한 사람이 다시 열기만 해도
        -- completed_at 이 now 로 덮여 완료 타임라인이 뒤로 밀렸다. (main 과 동일 동작)
        completed_at = CASE WHEN @status = 'completed'
                            THEN COALESCE(target.completed_at, @completed_at)
                            ELSE target.completed_at END
      WHEN NOT MATCHED THEN INSERT
        (session_id, userid, user_name, job, last_scene_id, status, data, completed_at)
        VALUES (@session_id, @userid, @user_name, @job, @last_scene_id, @status, @data, @completed_at)
      OUTPUT inserted.id, inserted.session_id, inserted.userid, inserted.user_name, inserted.job,
             inserted.last_scene_id, inserted.status, inserted.data,
             inserted.created_at, inserted.updated_at, inserted.completed_at;
    `);

  const row = result.recordset[0] as V3SessionRow | undefined;
  if (!row) throw new SessionOwnershipError(session.sessionId);
  return mapRow(row);
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
