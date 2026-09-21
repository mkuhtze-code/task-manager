-- Persist onboarding-derived priors so the thinking engine starts adapted.
-- Observed behaviour (calibration + same-day rates) overrides these over time.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS soft_cost_scale double precision DEFAULT 1.0;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS same_day_protection text
    CHECK (same_day_protection IS NULL OR same_day_protection IN ('low', 'medium', 'high'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS jobs_emphasis text
    CHECK (jobs_emphasis IS NULL OR jobs_emphasis IN ('off', 'light', 'medium', 'heavy'));

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS travel_emphasis boolean DEFAULT false;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS meetings_emphasis boolean DEFAULT false;
