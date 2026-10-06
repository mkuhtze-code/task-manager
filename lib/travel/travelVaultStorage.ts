/**
 * Travel vault file storage — Supabase Storage helpers.
 * Bucket: travel-docs (private). Path: {userId}/{tripId}/{uuid}_{safeName}
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const TRAVEL_VAULT_BUCKET = 'travel-docs';

/** Max upload size (10 MB). */
export const TRAVEL_VAULT_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
  'message/rfc822',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAllowedTravelVaultFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size <= 0) return { ok: false, reason: 'File is empty' };
  if (file.size > TRAVEL_VAULT_MAX_BYTES) {
    return { ok: false, reason: 'File must be 10 MB or smaller' };
  }
  const type = (file.type || '').toLowerCase();
  if (type && !ALLOWED_MIME.has(type)) {
    // Allow unknown type if extension looks safe (some mobile browsers omit MIME)
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const okExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'txt', 'eml', 'doc', 'docx'].includes(
      ext
    );
    if (!okExt) {
      return {
        ok: false,
        reason: 'Use PDF, image, text, or Word — other types are blocked',
      };
    }
  }
  return { ok: true };
}

export function safeFilename(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 120);
  return base || 'file';
}

export function buildTravelVaultObjectPath(
  userId: string,
  tripId: string,
  originalFilename: string
): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${tripId}/${id}_${safeFilename(originalFilename)}`;
}

export type TravelVaultUploadResult =
  | { ok: true; storagePath: string; originalFilename: string }
  | { ok: false; error: string };

/**
 * Upload a file into travel-docs. Caller must be authenticated as userId.
 */
export async function uploadTravelVaultFile(
  client: SupabaseClient,
  args: {
    userId: string;
    tripId: string;
    file: File;
  }
): Promise<TravelVaultUploadResult> {
  const check = isAllowedTravelVaultFile(args.file);
  if (!check.ok) return { ok: false, error: check.reason };

  const path = buildTravelVaultObjectPath(args.userId, args.tripId, args.file.name);

  const { error } = await client.storage.from(TRAVEL_VAULT_BUCKET).upload(path, args.file, {
    cacheControl: '3600',
    upsert: false,
    contentType: args.file.type || undefined,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes('Bucket not found') || error.message.includes('not found')
          ? 'Storage bucket travel-docs is missing — run the vault storage migration in Supabase'
          : error.message,
    };
  }

  return {
    ok: true,
    storagePath: path,
    originalFilename: args.file.name,
  };
}

/** Signed URL for private download (1 hour). */
export async function signedUrlForTravelVaultFile(
  client: SupabaseClient,
  storagePath: string,
  expiresSec = 3600
): Promise<{ url: string } | { error: string }> {
  const { data, error } = await client.storage
    .from(TRAVEL_VAULT_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error) {
    const msg = error.message || 'Signed URL failed';
    if (/bucket|not found/i.test(msg)) {
      return {
        error:
          'Storage bucket travel-docs missing or blocked — run 20261006_travel_vault_storage.sql in Supabase',
      };
    }
    if (/policy|permission|denied|row-level/i.test(msg)) {
      return {
        error:
          'No permission to read this file — check storage RLS policies for travel-docs',
      };
    }
    return { error: msg };
  }
  if (!data?.signedUrl) return { error: 'No download URL returned' };
  return { url: data.signedUrl };
}

/** Best-effort delete; ignore missing objects. */
export async function removeTravelVaultFile(
  client: SupabaseClient,
  storagePath: string | null | undefined
): Promise<void> {
  if (!storagePath) return;
  await client.storage.from(TRAVEL_VAULT_BUCKET).remove([storagePath]);
}
