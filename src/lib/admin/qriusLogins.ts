// qrius_logins 테이블 접근 — Supabase (main branch).
// 로그인 콜백이 recordQriusLogin 으로 append, 관리자 API 가 listQriusLogins 로 조회.
// REST 클라이언트는 serverStorage 의 supabaseFetch 를 공유.
// Schema: supabase/migrations/qrius_logins.sql
// (production 브랜치는 MSSQL 버전 — qrius_logins.mssql.sql 참고)

import { isSupabaseConfigured, supabaseFetch } from "@/lib/v3/session/serverStorage";
import type { QriusUser } from "@/lib/qrius/client";
import type { LoginEvent } from "./loginStats";

const TABLE = "qrius_logins";

interface QriusLoginRow {
  userid: string;
  email: string | null;
  name: string | null;
  logged_in_at: string;
}

export async function recordQriusLogin(user: QriusUser): Promise<void> {
  if (!user.userid || !isSupabaseConfigured()) return;
  await supabaseFetch(TABLE, {
    method: "POST",
    body: JSON.stringify({
      userid: user.userid,
      email: user.email,
      name: user.name,
      raw_json: user.raw ?? null,
    }),
  });
}

// ponytail: limit 50000 — 전량 메모리 집계. 이벤트가 수십만 건이 되면 뷰/RPC 집계로 전환.
export async function listQriusLogins(): Promise<LoginEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const res = await supabaseFetch(
    `${TABLE}?select=userid,email,name,logged_in_at&order=logged_in_at.desc&limit=50000`,
  );
  const rows = (await res.json()) as QriusLoginRow[];
  return rows.map((r) => ({
    userid: r.userid,
    email: r.email,
    name: r.name,
    loggedInAt: r.logged_in_at,
  }));
}
