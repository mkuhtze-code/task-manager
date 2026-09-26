/**
 * Client-side quota gate (UX). Hard enforcement is DB triggers
 * (assert_user_storage_available). Never rely on this alone for security.
 */

import { supabase } from '@/lib/supabaseClient';
import {
  buildStorageQuota,
  wouldExceedQuota,
  type StorageQuota,
} from '@/lib/storageQuota';

export const STORAGE_FULL_MESSAGE =
  'Storage is full. Free space in Account by deleting media before adding more.';

export async function loadUserQuota(userId: string): Promise<StorageQuota> {
  const { data } = await supabase
    .from('user_settings')
    .select('storage_used_bytes, storage_limit_bytes')
    .eq('user_id', userId)
    .maybeSingle();
  return buildStorageQuota(
    Number(data?.storage_used_bytes ?? 0),
    Number(data?.storage_limit_bytes ?? 0)
  );
}

/** Returns an error message if adding `additionalBytes` would exceed quota. */
export async function checkStorageQuota(
  userId: string,
  additionalBytes: number
): Promise<string | null> {
  if (!additionalBytes || additionalBytes <= 0) return null;
  const quota = await loadUserQuota(userId);
  if (wouldExceedQuota(quota, additionalBytes)) {
    return STORAGE_FULL_MESSAGE;
  }
  return null;
}

export function isQuotaErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('storage_quota_exceeded') || m.includes('storage is full');
}

