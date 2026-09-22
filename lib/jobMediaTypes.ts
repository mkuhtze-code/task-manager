import type { MediaSyncStatus } from '@/lib/meetingTypes';

export type JobMediaType = 'photo' | 'audio' | 'document';

/** Files and evidence stored against a Job — the system of record for shared documents. */
export type JobMedia = {
  id: string;
  user_id: string;
  job_id: string;
  media_type: JobMediaType;
  local_uri: string | null;
  storage_path: string | null;
  sync_status: MediaSyncStatus;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  /** Original filename when known (PDFs, uploads). */
  original_name: string | null;
  captured_at: string;
  created_at: string;
};

export function jobMediaDisplayName(m: JobMedia): string {
  if (m.caption && m.caption.trim()) return m.caption.trim();
  if (m.original_name && m.original_name.trim()) return m.original_name.trim();
  if (m.media_type === 'photo') return 'Photo';
  if (m.media_type === 'audio') return 'Audio';
  return m.mime_type?.includes('pdf') ? 'PDF' : 'File';
}
