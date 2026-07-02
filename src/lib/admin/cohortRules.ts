// cohort_rules 테이블 CRUD — MSSQL (production branch).
// main 의 Supabase REST 버전을 /sync-main 이 MSSQL 로 포팅한 것. exported 시그니처는
// main 과 동일하게 유지한다 (listCohortRules / upsertCohortRule / deleteCohortRule).
// 관리자만 부르는 서버 사이드 유틸. 커넥션 풀은 serverStorage 의 싱글톤을 공유.
// Schema: supabase/migrations/cohort_rules.mssql.sql

import sql from "mssql";
import { getPool } from "@/lib/v3/session/serverStorage";

const TABLE = "cohort_rules";

export interface CohortRule {
  id: string;
  name: string;
  /** ISO string (inclusive). */
  startAt: string;
  /** ISO string (inclusive). */
  endAt: string;
  createdAt: string;
  updatedAt: string;
}

interface CohortRuleRow {
  id: string;
  name: string;
  start_at: Date | string;
  end_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: CohortRuleRow): CohortRule {
  return {
    id: row.id,
    name: row.name,
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listCohortRules(): Promise<CohortRule[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT * FROM ${TABLE} ORDER BY start_at ASC`);
  return (result.recordset as CohortRuleRow[]).map(mapRow);
}

/** name 을 UNIQUE 키로 upsert. id 는 서버에서 발급. */
export async function upsertCohortRule(input: {
  name: string;
  startAt: string;
  endAt: string;
}): Promise<CohortRule> {
  if (!input.name.trim()) throw new Error("name is required");
  if (!input.startAt || !input.endAt) throw new Error("startAt / endAt are required");
  if (new Date(input.endAt).getTime() < new Date(input.startAt).getTime()) {
    throw new Error("endAt must be on or after startAt");
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .input("name", sql.NVarChar(255), input.name.trim())
    .input("start_at", sql.DateTime2, new Date(input.startAt))
    .input("end_at", sql.DateTime2, new Date(input.endAt))
    .input("updated_at", sql.DateTime2, new Date())
    .query(`
      MERGE ${TABLE} WITH (HOLDLOCK) AS target
      USING (SELECT @name AS name) AS src
        ON target.name = src.name
      WHEN MATCHED THEN UPDATE SET
        start_at = @start_at, end_at = @end_at, updated_at = @updated_at
      WHEN NOT MATCHED THEN INSERT (name, start_at, end_at)
        VALUES (@name, @start_at, @end_at)
      OUTPUT inserted.id, inserted.name, inserted.start_at, inserted.end_at,
             inserted.created_at, inserted.updated_at;
    `);
  return mapRow(result.recordset[0] as CohortRuleRow);
}

export async function deleteCohortRule(id: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM ${TABLE} WHERE id = @id`);
}
