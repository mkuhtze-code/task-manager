-- Per-account Dokkit-hosted storage quota (SOC2/ISO-minded: least privilege,
-- server-maintained counters, no client-writable usage fields).
-- Default limit: 30 GiB total per user.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint NOT NULL DEFAULT 32212254720;

COMMENT ON COLUMN public.user_settings.storage_used_bytes IS
  'Bytes of Dokkit-hosted file storage attributed to this user. Maintained by triggers; not client-writable.';
COMMENT ON COLUMN public.user_settings.storage_limit_bytes IS
  'Hard ceiling for Dokkit-hosted file storage (default 30 GiB). Changed only via service role / admin.';

-- Ensure meeting_media has an index for per-user aggregation.
CREATE INDEX IF NOT EXISTS meeting_media_user_id_idx
  ON public.meeting_media (user_id);

CREATE INDEX IF NOT EXISTS meeting_media_user_size_idx
  ON public.meeting_media (user_id, size_bytes);

-- Security-definer adjuster: only this path updates storage_used_bytes.
CREATE OR REPLACE FUNCTION public.adjust_user_storage(p_user_id uuid, p_delta bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.user_settings (user_id, storage_used_bytes)
  VALUES (p_user_id, GREATEST(0, p_delta))
  ON CONFLICT (user_id) DO UPDATE
  SET storage_used_bytes = GREATEST(0, public.user_settings.storage_used_bytes + p_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_user_storage(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_user_storage(uuid, bigint) TO service_role;

-- Trigger on meeting_media: keep running total in sync.
CREATE OR REPLACE FUNCTION public.meeting_media_storage_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.size_bytes, 0);
    IF delta <> 0 THEN
      PERFORM public.adjust_user_storage(NEW.user_id, delta);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    delta := -COALESCE(OLD.size_bytes, 0);
    IF delta <> 0 THEN
      PERFORM public.adjust_user_storage(OLD.user_id, delta);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM public.adjust_user_storage(OLD.user_id, -COALESCE(OLD.size_bytes, 0));
      PERFORM public.adjust_user_storage(NEW.user_id, COALESCE(NEW.size_bytes, 0));
    ELSIF COALESCE(OLD.size_bytes, 0) IS DISTINCT FROM COALESCE(NEW.size_bytes, 0) THEN
      PERFORM public.adjust_user_storage(
        NEW.user_id,
        COALESCE(NEW.size_bytes, 0) - COALESCE(OLD.size_bytes, 0)
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meeting_media_storage_aiud ON public.meeting_media;
CREATE TRIGGER meeting_media_storage_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.meeting_media
  FOR EACH ROW
  EXECUTE FUNCTION public.meeting_media_storage_trg();

-- Prevent authenticated clients from forging usage or raising their own limit.
CREATE OR REPLACE FUNCTION public.user_settings_protect_storage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Always preserve usage counter from prior row for non-service callers.
    -- Service role updates (e.g. admin limit change) set request role differently;
    -- we still lock storage_used_bytes unless explicitly adjusted via adjust_user_storage.
    NEW.storage_used_bytes := OLD.storage_used_bytes;
    -- storage_limit_bytes: only service_role may change.
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      NEW.storage_limit_bytes := OLD.storage_limit_bytes;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_settings_protect_storage_bu ON public.user_settings;
CREATE TRIGGER user_settings_protect_storage_bu
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.user_settings_protect_storage();

-- One-time backfill from existing meeting_media rows.
UPDATE public.user_settings us
SET storage_used_bytes = COALESCE(agg.total_bytes, 0)
FROM (
  SELECT user_id, SUM(COALESCE(size_bytes, 0))::bigint AS total_bytes
  FROM public.meeting_media
  GROUP BY user_id
) agg
WHERE us.user_id = agg.user_id;
