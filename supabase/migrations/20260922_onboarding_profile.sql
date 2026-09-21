-- Tailored onboarding profile
-- Stores questionnaire answers so Dokkit can seed sensible defaults
-- (capacity, Jobs emphasis, carry behaviour) from day one.
-- Observed behaviour still overrides these priors over time.

-- Full answers blob (source of truth for Preferences / re-edit)
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_answers jsonb;

-- Flattened fields for easy querying / defaults application
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IS NULL OR role IN (
      'professional', 'student', 'knowledge_worker', 'personal', 'other'
    ));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS work_type text
    CHECK (work_type IS NULL OR work_type IN (
      'trades_field', 'client_services', 'creative',
      'operations', 'other_professional'
    ));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS carry_style text
    CHECK (carry_style IS NULL OR carry_style IN (
      'mostly_moves', 'mixed', 'prefer_same_day', 'unsure'
    ));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS day_shape text;

-- ── Force test account through questionnaire every time ─────────────
-- newuser@dokkit.space is always treated as not-onboarded so the full
-- flow can be exercised without deleting the account.

CREATE OR REPLACE FUNCTION public.force_onboarding_for_test_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) = 'newuser@dokkit.space' THEN
    UPDATE public.user_settings
    SET onboarded = false
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS force_onboarding_test_user ON auth.users;
CREATE TRIGGER force_onboarding_test_user
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.force_onboarding_for_test_user();
