/**
 * Cross-device media: local IndexedDB cache + Supabase Storage source of truth.
 *
 * Path layout (bucket dokkit-media):
 *   {userId}/meetings/{meetingId}/{mediaId}
 *   {userId}/jobs/{jobId}/{mediaId}
 *
 * Compliance: private bucket, per-user path prefix, no public URLs required
 * (authenticated download). Quota is enforced before insert; this module
 * only moves bytes.
 */

import { supabase } from '@/lib/supabaseClient';
import { saveMediaBlob, loadMediaBlob, isMediaRef } from '@/lib/mediaStore';

export const MEDIA_BUCKET = 'dokkit-media';

export type MediaSyncStatus = 'local_only' | 'uploading' | 'synced' | 'failed';

export function meetingStoragePath(
  userId: string,
  meetingId: string,
  mediaId: string
): string {
  return `${userId}/meetings/${meetingId}/${mediaId}`;
}

export function jobStoragePath(userId: string, jobId: string, mediaId: string): string {
  return `${userId}/jobs/${jobId}/${mediaId}`;
}

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('pdf')) return 'pdf';
  return 'bin';
}

/** Upload local bytes to Storage and mark the meeting_media row synced. */
export async function syncMeetingMediaToCloud(input: {
  userId: string;
  meetingId: string;
  mediaId: string;
  localUri: string;
  mimeType?: string | null;
}): Promise<{ ok: boolean; storagePath?: string; error?: string }> {
  const blob = await loadMediaBlob(input.localUri);
  if (!blob) {
    return { ok: false, error: 'Local bytes unavailable for upload' };
  }

  await supabase
    .from('meeting_media')
    .update({ sync_status: 'uploading' })
    .eq('id', input.mediaId)
    .eq('user_id', input.userId);

  const path =
    meetingStoragePath(input.userId, input.meetingId, input.mediaId) +
    '.' +
    extFromMime(input.mimeType || blob.type);

  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: input.mimeType || blob.type || 'application/octet-stream',
    upsert: true,
  });

  if (upErr) {
    await supabase
      .from('meeting_media')
      .update({ sync_status: 'failed' })
      .eq('id', input.mediaId)
      .eq('user_id', input.userId);
    return { ok: false, error: upErr.message };
  }

  const { error: rowErr } = await supabase
    .from('meeting_media')
    .update({ storage_path: path, sync_status: 'synced' })
    .eq('id', input.mediaId)
    .eq('user_id', input.userId);

  if (rowErr) {
    return { ok: false, error: rowErr.message, storagePath: path };
  }

  return { ok: true, storagePath: path };
}

/** Upload job media the same way. */
export async function syncJobMediaToCloud(input: {
  userId: string;
  jobId: string;
  mediaId: string;
  localUri: string;
  mimeType?: string | null;
}): Promise<{ ok: boolean; storagePath?: string; error?: string }> {
  const blob = await loadMediaBlob(input.localUri);
  if (!blob) {
    return { ok: false, error: 'Local bytes unavailable for upload' };
  }

  await supabase
    .from('job_media')
    .update({ sync_status: 'uploading' })
    .eq('id', input.mediaId)
    .eq('user_id', input.userId);

  const path =
    jobStoragePath(input.userId, input.jobId, input.mediaId) +
    '.' +
    extFromMime(input.mimeType || blob.type);

  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: input.mimeType || blob.type || 'application/octet-stream',
    upsert: true,
  });

  if (upErr) {
    await supabase
      .from('job_media')
      .update({ sync_status: 'failed' })
      .eq('id', input.mediaId)
      .eq('user_id', input.userId);
    return { ok: false, error: upErr.message };
  }

  const { error: rowErr } = await supabase
    .from('job_media')
    .update({ storage_path: path, sync_status: 'synced' })
    .eq('id', input.mediaId)
    .eq('user_id', input.userId);

  if (rowErr) {
    return { ok: false, error: rowErr.message, storagePath: path };
  }

  return { ok: true, storagePath: path };
}

/**
 * Resolve bytes for display:
 * 1. IndexedDB (same device)
 * 2. Supabase Storage (other device / cleared cache) → cache into IDB
 */
export async function resolveMediaBlob(
  localUri: string | null | undefined,
  storagePath?: string | null
): Promise<Blob | null> {
  if (localUri && isMediaRef(localUri)) {
    const local = await loadMediaBlob(localUri);
    if (local) return local;
  }

  if (!storagePath) return null;

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(storagePath);
  if (error || !data) return null;

  // Seed local cache so next paint is offline-friendly on this device.
  try {
    await saveMediaBlob(data, { mime: data.type, size: data.size });
  } catch {
    // Cache failure is non-fatal; still return cloud bytes.
  }

  return data;
}

/** Remove object from Storage when the user deletes media (best-effort). */
export async function deleteCloudMedia(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
}
