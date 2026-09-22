import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import {
  DEFAULT_STORAGE_LIMIT_BYTES,
  buildStorageQuota,
} from '@/lib/storageQuota';

/**
 * Returns the caller's storage quota only (no other users).
 * Usage figures come from server-maintained user_settings columns.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('storage_used_bytes, storage_limit_bytes')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) {
    console.error('account/storage:', error.message);
    return NextResponse.json({ error: 'Could not load storage usage' }, { status: 500 });
  }

  const used = Number(data?.storage_used_bytes ?? 0);
  const limit = Number(data?.storage_limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES);
  const quota = buildStorageQuota(used, limit);

  return NextResponse.json({
    usedBytes: quota.usedBytes,
    limitBytes: quota.limitBytes,
    remainingBytes: quota.remainingBytes,
    ratio: quota.ratio,
    state: quota.state,
  });
}
