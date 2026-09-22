import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';
import { DEFAULT_STORAGE_LIMIT_BYTES } from '@/lib/storageQuota';

/**
 * System-level storage monitor — aggregates only.
 * No user ids, emails, or file contents (data minimization).
 */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const { data: settingsRows, error: settingsErr } = await supabaseAdmin
      .from('user_settings')
      .select('storage_used_bytes, storage_limit_bytes');

    if (settingsErr) throw settingsErr;

    const rows = settingsRows || [];
    let totalUsed = 0;
    let totalLimit = 0;
    let usersWithMedia = 0;
    let usersWarning = 0;
    let usersCritical = 0;
    let usersExceeded = 0;

    for (const r of rows) {
      const used = Number(r.storage_used_bytes ?? 0);
      const limit = Number(r.storage_limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES);
      totalUsed += used;
      totalLimit += limit;
      if (used > 0) usersWithMedia += 1;
      if (limit <= 0) continue;
      const ratio = used / limit;
      if (used >= limit) usersExceeded += 1;
      else if (ratio >= 0.95) usersCritical += 1;
      else if (ratio >= 0.8) usersWarning += 1;
    }

    const { count: mediaObjectCount, error: mediaErr } = await supabaseAdmin
      .from('meeting_media')
      .select('id', { count: 'exact', head: true });

    if (mediaErr) throw mediaErr;

    const { data: sumRow, error: sumErr } = await supabaseAdmin.rpc(
      'admin_storage_bytes_sum'
    ).maybeSingle?.() ?? { data: null, error: null };

    // Fallback if RPC not installed: use settings total (already summed).
    void sumRow;
    void sumErr;

    await writeAdminAudit({
      actorId: access.userId,
      action: 'storage_snapshot.view',
      targetType: 'system',
      metadata: {
        totalUsedBytes: totalUsed,
        accountCount: rows.length,
        // No user identifiers in audit metadata.
      },
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      privacyNote:
        'System totals only. No user identifiers, emails, or file contents are included.',
      accounts: rows.length,
      usersWithMedia,
      usersWarning,
      usersCritical,
      usersExceeded,
      totalUsedBytes: totalUsed,
      totalLimitBytes: totalLimit,
      mediaObjectCount: mediaObjectCount ?? 0,
      defaultLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Storage snapshot failed';
    await logError({
      source: 'api.admin.storage-snapshot',
      message,
      userId: access.userId,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
