-- llm_usage (MSSQL / T-SQL) — production branch.
-- /api/v3/llm 요청 1건당 1행 append. userid 는 qrius 세션 쿠키에서 추출
-- (없으면 NULL — 비로그인/시크릿 미설정 환경). 토큰 수는 provider 응답의
-- usage 필드 그대로. 관리자 페이지의 "LLM 사용량" 섹션이 userid 별로 집계.
--
-- Run once against the target database — deploy.sh / redeploy.sh /
-- setup-mssql.sh apply every *.mssql.sql automatically (IF NOT EXISTS-idempotent).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'llm_usage')
BEGIN
  CREATE TABLE dbo.llm_usage (
    id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_llm_usage PRIMARY KEY
                       DEFAULT NEWID(),
    userid            NVARCHAR(255) NULL,
    session_id        NVARCHAR(255) NULL,
    task              NVARCHAR(64)  NOT NULL,
    tier              NVARCHAR(8)   NOT NULL,
    mode              NVARCHAR(8)   NULL,
    providers         NVARCHAR(255) NOT NULL,
    calls             INT NOT NULL,
    prompt_tokens     INT NOT NULL,
    completion_tokens INT NOT NULL,
    ms                INT NOT NULL,
    created_at        DATETIME2 NOT NULL CONSTRAINT DF_llm_usage_at DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_llm_usage_userid ON dbo.llm_usage (userid);
  CREATE INDEX IX_llm_usage_at     ON dbo.llm_usage (created_at DESC);
END;
GO
