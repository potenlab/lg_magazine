-- v3_sessions.userid (MSSQL / T-SQL) — production branch.
-- W5.2 모의해킹 조치: 세션 소유자 컬럼. POST /api/v3/sessions 가 qrius 세션의
-- userid 를 도장(stamp)하고, 소유자가 다른 세션의 upsert 를 거부하는 데 쓴다.
-- 기존 행은 NULL 로 남고, 실제 소유자의 다음 저장 때 자연히 채워진다.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.v3_sessions') AND name = 'userid'
)
BEGIN
  ALTER TABLE dbo.v3_sessions ADD userid NVARCHAR(255) NULL;
END;
GO
