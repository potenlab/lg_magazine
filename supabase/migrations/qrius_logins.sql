-- qrius_logins (Supabase / Postgres) — main branch.
-- LG(Qrius) SSO 로그인 이벤트 로그. 성공한 콜백마다 1행 append.
-- CNS 스펙상 userinfo 는 이메일·이름·회사 등을 내려준다 (docs/qrius_oauth_guide.md).
-- 확정 필드는 컬럼으로, 나머지는 raw_json 원본으로 보존한다.
-- "등록 사용자" = DISTINCT userid. 세션 쿠키가 살아있는 동안은 콜백이
-- 안 타므로 방문수가 아니라 로그인 횟수를 측정한다.
-- (production 브랜치의 MSSQL 버전: qrius_logins.mssql.sql)

CREATE TABLE IF NOT EXISTS public.qrius_logins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userid       TEXT NOT NULL,
  email        TEXT,
  name         TEXT,
  raw_json     JSONB,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qrius_logins_userid_idx
  ON public.qrius_logins (userid);

CREATE INDEX IF NOT EXISTS qrius_logins_at_idx
  ON public.qrius_logins (logged_in_at DESC);

-- v3_sessions 와 동일한 정책: service-role (server) 만 읽기/쓰기.
ALTER TABLE public.qrius_logins ENABLE ROW LEVEL SECURITY;
