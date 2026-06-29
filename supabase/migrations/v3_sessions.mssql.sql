-- v3_sessions (MSSQL / T-SQL) — production branch.
-- T-SQL port of supabase/migrations/v3_sessions.sql.
--   JSONB        -> NVARCHAR(MAX) holding JSON text
--   UUID/gen_random_uuid() -> UNIQUEIDENTIFIER / NEWID()
--   TIMESTAMPTZ/NOW()      -> DATETIME2 / SYSUTCDATETIME()
-- Run once against the target database (e.g. via sqlcmd) before first boot.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'v3_sessions')
BEGIN
  CREATE TABLE dbo.v3_sessions (
    id            UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_v3_sessions PRIMARY KEY
                   DEFAULT NEWID(),
    session_id    NVARCHAR(255) NOT NULL,
    user_name     NVARCHAR(255) NULL,
    job           NVARCHAR(255) NULL,
    last_scene_id NVARCHAR(255) NULL,
    status        NVARCHAR(20) NOT NULL CONSTRAINT DF_v3_sessions_status DEFAULT 'in_progress'
                   CONSTRAINT CK_v3_sessions_status CHECK (status IN ('in_progress', 'completed')),
    data          NVARCHAR(MAX) NOT NULL
                   CONSTRAINT CK_v3_sessions_data_json CHECK (ISJSON(data) = 1),
    created_at    DATETIME2 NOT NULL CONSTRAINT DF_v3_sessions_created DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2 NOT NULL CONSTRAINT DF_v3_sessions_updated DEFAULT SYSUTCDATETIME(),
    completed_at  DATETIME2 NULL,
    CONSTRAINT UQ_v3_sessions_session_id UNIQUE (session_id)
  );

  CREATE INDEX IX_v3_sessions_updated_at ON dbo.v3_sessions (updated_at DESC);
  CREATE INDEX IX_v3_sessions_status     ON dbo.v3_sessions (status);
END;
GO
