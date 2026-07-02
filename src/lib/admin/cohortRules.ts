// cohort_rules 테이블 CRUD — Supabase REST (v3 serverStorage 와 동일 패턴).
// 관리자만 부르는 서버 사이드 유틸이라 service-role 키를 그대로 쓴다.

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
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
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

function mapRow(row: CohortRuleRow): CohortRule {
  return {
    id: row.id,
    name: row.name,
    startAt: row.start_at,
    endAt: row.end_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCohortRules(): Promise<CohortRule[]> {
  const res = await supabaseFetch(`${TABLE}?select=*&order=start_at.asc`);
  const rows = (await res.json()) as CohortRuleRow[];
  return rows.map(mapRow);
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
  const payload = {
    name: input.name.trim(),
    start_at: input.startAt,
    end_at: input.endAt,
    updated_at: new Date().toISOString(),
  };
  const res = await supabaseFetch(`${TABLE}?on_conflict=name`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = (await res.json()) as CohortRuleRow[];
  return mapRow(rows[0]);
}

export async function deleteCohortRule(id: string): Promise<void> {
  const encoded = encodeURIComponent(id);
  await supabaseFetch(`${TABLE}?id=eq.${encoded}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}
