-- cohort_rules (MSSQL / T-SQL) — production branch.
-- T-SQL port of supabase/migrations/cohort_rules.sql.
--   UUID/gen_random_uuid() -> UNIQUEIDENTIFIER / NEWID()
--   TIMESTAMPTZ/NOW()      -> DATETIME2 / SYSUTCDATETIME()
--
-- 관리자가 등록하는 "차수(4차/5차/6차 …)" 정의. 값은 (name, [start_at, end_at])
-- 삼중 조합이며, v3_sessions.created_at 을 이 구간과 매칭해 차수를 계산한다.
-- 즉 세션 자체에는 차수 컬럼을 저장하지 않는다 — 규칙만 바꾸면 소급 재분류된다.
-- 구간이 겹칠 경우 name 오름차순 첫 매칭이 이긴다(assignCohort 참조).
-- 구간에 걸리지 않는 세션은 "미지정" 으로 표시된다.
--
-- Run once against the target database (e.g. via sqlcmd) before first boot.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'cohort_rules')
BEGIN
  CREATE TABLE dbo.cohort_rules (
    id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_cohort_rules PRIMARY KEY
                DEFAULT NEWID(),
    name       NVARCHAR(255) NOT NULL CONSTRAINT UQ_cohort_rules_name UNIQUE,
    start_at   DATETIME2 NOT NULL,
    end_at     DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_cohort_rules_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_cohort_rules_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_cohort_rules_range_valid CHECK (end_at >= start_at)
  );

  CREATE INDEX IX_cohort_rules_range ON dbo.cohort_rules (start_at, end_at);
END;
GO
