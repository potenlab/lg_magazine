// llm_usage 테이블 접근 — MSSQL (production branch).
// /api/v3/llm 가 recordLlmUsage 로 요청당 1행 append (fire-and-forget),
// 관리자 API 가 summarizeLlmUsage 로 userid 별 집계 조회.
// 커넥션 풀은 serverStorage 의 싱글톤을 공유.
// Schema: supabase/migrations/llm_usage.mssql.sql

import sql from "mssql";
import { getPool } from "@/lib/v3/session/serverStorage";

const TABLE = "llm_usage";

// ponytail: 요금은 7월 AI스튜디오 청구 실측 평균(heavy ₩32/호출, light ₩5/호출).
// 정확한 청구는 스튜디오 대시보드가 기준 — 여긴 테스트 데이 감시용 추정치.
const COST_PER_CALL_KRW = { heavy: 32, light: 5 } as const;

export interface LlmUsageRecord {
  userid: string | null;
  sessionId: string | null;
  task: string;
  tier: "light" | "heavy";
  mode: string | null;
  providers: string[];
  calls: number;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

export interface LlmUsageUserSummary {
  userid: string;
  requests: number;
  heavyCalls: number;
  lightCalls: number;
  promptTokens: number;
  completionTokens: number;
  estCostKrw: number;
  lastAt: string;
}

export interface LlmUsageSummary {
  users: LlmUsageUserSummary[];
  totals: {
    requests: number;
    heavyCalls: number;
    lightCalls: number;
    promptTokens: number;
    completionTokens: number;
    estCostKrw: number;
  };
}

export async function recordLlmUsage(rec: LlmUsageRecord): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("userid", sql.NVarChar(255), rec.userid)
    .input("session_id", sql.NVarChar(255), rec.sessionId)
    .input("task", sql.NVarChar(64), rec.task)
    .input("tier", sql.NVarChar(8), rec.tier)
    .input("mode", sql.NVarChar(8), rec.mode)
    .input("providers", sql.NVarChar(255), rec.providers.join(","))
    .input("calls", sql.Int, rec.calls)
    .input("prompt_tokens", sql.Int, rec.promptTokens)
    .input("completion_tokens", sql.Int, rec.completionTokens)
    .input("ms", sql.Int, rec.ms)
    .query(
      `INSERT INTO ${TABLE} (userid, session_id, task, tier, mode, providers, calls, prompt_tokens, completion_tokens, ms)
       VALUES (@userid, @session_id, @task, @tier, @mode, @providers, @calls, @prompt_tokens, @completion_tokens, @ms)`,
    );
}

interface SummaryRow {
  userid: string | null;
  requests: number;
  heavy_calls: number;
  light_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  last_at: Date | string;
}

export async function summarizeLlmUsage(): Promise<LlmUsageSummary> {
  const pool = await getPool();
  const result = await pool.request().query(
    `SELECT userid,
            COUNT(*) AS requests,
            SUM(CASE WHEN tier = 'heavy' THEN calls ELSE 0 END) AS heavy_calls,
            SUM(CASE WHEN tier = 'light' THEN calls ELSE 0 END) AS light_calls,
            SUM(prompt_tokens) AS prompt_tokens,
            SUM(completion_tokens) AS completion_tokens,
            MAX(created_at) AS last_at
     FROM ${TABLE}
     GROUP BY userid
     ORDER BY MAX(created_at) DESC`,
  );
  const users = (result.recordset as SummaryRow[]).map((r) => ({
    userid: r.userid ?? "(비로그인)",
    requests: r.requests,
    heavyCalls: r.heavy_calls,
    lightCalls: r.light_calls,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    estCostKrw: Math.round(
      r.heavy_calls * COST_PER_CALL_KRW.heavy + r.light_calls * COST_PER_CALL_KRW.light,
    ),
    lastAt: r.last_at instanceof Date ? r.last_at.toISOString() : r.last_at,
  }));
  const totals = users.reduce(
    (acc, u) => ({
      requests: acc.requests + u.requests,
      heavyCalls: acc.heavyCalls + u.heavyCalls,
      lightCalls: acc.lightCalls + u.lightCalls,
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      estCostKrw: acc.estCostKrw + u.estCostKrw,
    }),
    { requests: 0, heavyCalls: 0, lightCalls: 0, promptTokens: 0, completionTokens: 0, estCostKrw: 0 },
  );
  return { users, totals };
}
