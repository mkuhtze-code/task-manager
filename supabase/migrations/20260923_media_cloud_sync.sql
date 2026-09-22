-- Cloud media sync: meeting_media gains storage_path + sync_status.
-- job_media provides the same pattern for Jobs (capture once, use everywhere).
-- Bucket: dokkit-media (create in Dashboard if missing; policies below).

-- ── meeting_media cloud columns ─────────────────────────────────
ALTER TABLE public.meeting_media
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.meeting_media
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'local_only'
    CHECK (sync_status IN ('local_only', 'uploading', 'synced', 'failed'));

COMMENT ON COLUMN public.meeting_media.storage_path IS
  'Path within dokkit-media bucket. Null until uploaded. Shared across devices.';
COMMENT ON COLUMN public.meeting_media.sync_status IS
  'local_only | uploading | synced | failed';

CREATE INDEX IF NOT EXISTS meeting_media_storage_path_idx
  ON public.meeting_media (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS meeting_media_sync_status_idx
  ON public.meeting_media (user_id, sync_status);

-- ── job_media (Jobs surface — same cloud model) ───────────────────
CREATE TABLE IF NOT EXISTS public.job_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'audio', 'document')),
  local_uri text,
  storage_path text,
  sync_status text NOT NULL DEFAULT 'local_only'
    CHECK (sync_status IN ('local_only', 'uploading', 'synced', 'failed')),
  mime_type text,
  size_bytes bigint,
  caption text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_media_job_id_idx ON public.job_media (job_id);
CREATE INDEX IF NOT EXISTS job_media_user_id_idx ON public.job_media (user_id);

ALTER TABLE public.job_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own job media" ON public.job_media;
CREATE POLICY "own job media" ON public.job_media
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- job_media counts toward the same account storage quota.
CREATE OR REPLACE FUNCTION public.job_media_storage_trg()
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

DROP TRIGGER IF EXISTS job_media_storage_aiud ON public.job_media;
CREATE TRIGGER job_media_storage_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.job_media
  FOR EACH ROW
  EXECUTE FUNCTION public.job_media_storage_trg();

-- ── Storage bucket policies (bucket must exist: dokkit-media, private) ─
-- Create via Dashboard: Storage → New bucket → id `dokkit-media` → private.
-- Paths: {user_id}/meetings/... or {user_id}/jobs/...

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dokkit-media', 'dokkit-media', false, 52428800)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 52428800;

DROP POLICY IF EXISTS "dokkit media select own" ON storage.objects;
CREATE POLICY "dokkit media select own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dokkit-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "dokkit media insert own" ON storage.objects;
CREATE POLICY "dokkit media insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dokkit-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "dokkit media update own" ON storage.objects;
CREATE POLICY "dokkit media update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dokkit-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "dokkit media delete own" ON storage.objects;
CREATE POLICY "dokkit media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dokkit-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
