-- Display name for uploaded documents (PDF, etc.)
ALTER TABLE public.job_media
  ADD COLUMN IF NOT EXISTS original_name text;

COMMENT ON COLUMN public.job_media.original_name IS
  'Client filename when the user uploaded a file; optional for camera captures.';
