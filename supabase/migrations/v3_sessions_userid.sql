-- v3_sessions.userid (Postgres) — main 브랜치 병합용 페어.
-- W5.2 모의해킹 조치: 세션 소유자 컬럼 (v3_sessions_userid.mssql.sql 참조).

alter table v3_sessions add column if not exists userid text;
