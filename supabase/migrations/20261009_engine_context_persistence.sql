-- Persist the deterministic capture engine's short-term context per account.
-- The existing user_settings RLS policy restricts access to auth.uid() = user_id.
-- JSONB keeps the versioned engine snapshot/request evolvable without new tables.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS engine_working_memory jsonb;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS engine_active_request jsonb;

COMMENT ON COLUMN public.user_settings.engine_working_memory IS
  'Versioned deterministic short-term working-memory snapshot for cross-session reference resolution.';

COMMENT ON COLUMN public.user_settings.engine_active_request IS
  'Versioned deterministic active capture request for cross-session reference resolution.';
