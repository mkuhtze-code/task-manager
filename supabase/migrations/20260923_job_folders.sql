-- User-named folders on a Job (Plans, Orders, etc.) for organizing job_media.

CREATE TABLE IF NOT EXISTS public.job_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_folders_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS job_folders_job_id_idx ON public.job_folders (job_id);
CREATE INDEX IF NOT EXISTS job_folders_user_job_idx ON public.job_folders (user_id, job_id);

-- One folder name per job (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS job_folders_job_name_unique
  ON public.job_folders (job_id, lower(trim(name)));

ALTER TABLE public.job_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own job folders" ON public.job_folders;
CREATE POLICY "own job folders" ON public.job_folders
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.job_media
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.job_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_media_folder_id_idx
  ON public.job_media (folder_id)
  WHERE folder_id IS NOT NULL;

COMMENT ON TABLE public.job_folders IS
  'Named folders on a Job for organizing files (e.g. Plans, Orders).';
COMMENT ON COLUMN public.job_media.folder_id IS
  'Optional folder; null = unfiled / root on the job.';
