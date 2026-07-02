// qrius_logins 테이블 접근 — MSSQL (production branch).
// 로그인 콜백이 recordQriusLogin 으로 append, 관리자 API 가 listQriusLogins 로 조회.
// 커넥션 풀은 serverStorage 의 싱글톤을 공유.
// Schema: supabase/migrations/qrius_logins.mssql.sql

import sql from "mssql";
import { getPool } from "@/lib/v3/session/serverStorage";
import type { QriusUser } from "@/lib/qrius/client";
import type { LoginEvent } from "./loginStats";

const TABLE = "qrius_logins";

interface QriusLoginRow {
  userid: string;
  email: string | null;
  name: string | null;
  logged_in_at: Date | string;
}

export async function recordQriusLogin(user: QriusUser): Promise<void> {
  if (!user.userid) return;
  const pool = await getPool();
  await pool
    .request()
    .input("userid", sql.NVarChar(255), user.userid)
    .input("email", sql.NVarChar(255), user.email)
    .input("name", sql.NVarChar(255), user.name)
    .input("raw_json", sql.NVarChar(sql.MAX), JSON.stringify(user.raw))
    .query(`INSERT INTO ${TABLE} (userid, email, name, raw_json) VALUES (@userid, @email, @name, @raw_json)`);
}

// ponytail: TOP 50000 cap — 전량 메모리 집계. 이벤트가 수십만 건이 되면 SQL GROUP BY 로 전환.
export async function listQriusLogins(): Promise<LoginEvent[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT TOP 50000 userid, email, name, logged_in_at FROM ${TABLE} ORDER BY logged_in_at DESC`);
  return (result.recordset as QriusLoginRow[]).map((r) => ({
    userid: r.userid,
    email: r.email,
    name: r.name,
    loggedInAt:
      r.logged_in_at instanceof Date ? r.logged_in_at.toISOString() : r.logged_in_at,
  }));
}
