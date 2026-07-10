-- qrius_logins (MSSQL / T-SQL) — production branch.
-- LG(Qrius) SSO 로그인 이벤트 로그. 성공한 콜백마다 1행 append.
-- CNS 스펙상 userinfo 는 이메일·이름·회사 등을 내려준다 (docs/qrius_oauth_guide.md).
-- 확정 필드는 컬럼으로, 나머지는 raw_json 원본으로 보존한다.
-- "등록 사용자" = DISTINCT userid. 세션 쿠키가 살아있는 동안은 콜백이
-- 안 타므로 방문수가 아니라 로그인 횟수를 측정한다.
--
-- Run once against the target database — deploy.sh / redeploy.sh /
-- setup-mssql.sh apply every *.mssql.sql automatically (IF NOT EXISTS-idempotent).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'qrius_logins')
BEGIN
  CREATE TABLE dbo.qrius_logins (
    id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_qrius_logins PRIMARY KEY
                  DEFAULT NEWID(),
    userid       NVARCHAR(255) NOT NULL,
    email        NVARCHAR(255) NULL,
    name         NVARCHAR(255) NULL,
    raw_json     NVARCHAR(MAX) NULL,
    logged_in_at DATETIME2 NOT NULL CONSTRAINT DF_qrius_logins_at DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_qrius_logins_userid ON dbo.qrius_logins (userid);
  CREATE INDEX IX_qrius_logins_at     ON dbo.qrius_logins (logged_in_at DESC);
END;
GO
