-- v3_sessions
-- Stores every v3 (vision-express) participant session, mirrored from the
-- client's localStorage by V3SessionContext's debounced auto-save.
-- Kept separate from `branding_submissions` (v2) so the two schemas don't
-- collide and admin views can evolve independently.

CREATE TABLE IF NOT EXISTS public.v3_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT NOT NULL UNIQUE,
  user_name     TEXT,
  job           TEXT,
  last_scene_id TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'completed')),
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS v3_sessions_updated_at_idx
  ON public.v3_sessions (updated_at DESC);

CREATE INDEX IF NOT EXISTS v3_sessions_status_idx
  ON public.v3_sessions (status);

-- Realtime / RLS:
-- Pilot stays open via service-role key (matching v2 branding_submissions).
-- For production, gate writes behind a short-lived signed token issued
-- after L-OWL identity question (analyze.md §12.9, P5).
ALTER TABLE public.v3_sessions ENABLE ROW LEVEL SECURITY;

-- No public policies yet — only service-role (server) can read/write.
-- Anonymous clients hitting REST without the service key will be denied,
-- which is what we want during the pilot.
