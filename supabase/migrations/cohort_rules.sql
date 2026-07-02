-- cohort_rules
-- 관리자가 등록하는 "차수(4차/5차/6차 …)" 정의. 값은 (name, [start_at, end_at])
-- 삼중 조합이며, v3_sessions.created_at 을 이 구간과 매칭해 차수를 계산한다.
-- 즉 세션 자체에는 차수 컬럼을 저장하지 않는다 — 규칙만 바꾸면 소급 재분류된다.
--
-- 구간이 겹칠 경우 name 오름차순 첫 매칭이 이긴다(assignCohort 참조).
-- 구간에 걸리지 않는 세션은 "미지정" 으로 표시된다.

CREATE TABLE IF NOT EXISTS public.cohort_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cohort_rules_range_valid CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS cohort_rules_range_idx
  ON public.cohort_rules (start_at, end_at);

ALTER TABLE public.cohort_rules ENABLE ROW LEVEL SECURITY;
-- v3_sessions 와 동일 — service-role 만 접근. 관리자 API 를 거쳐서만 read/write.
