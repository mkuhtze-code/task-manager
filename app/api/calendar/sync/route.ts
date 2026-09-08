import { NextRequest, NextResponse } from 'next/server';
import { syncAllConnections } from '@/lib/calendar/sync';
import { logError } from '@/lib/logError';

// Cron-synced calendar endpoint. Same pattern as check-task-timers: a GET
// guarded by the shared cron secret. Deployed as a Vercel Cron:
//
//   crons:
//     - schedule: "0 */4 * * *"
//       path: /app/api/calendar/sync?secret=...CRON_CHECK_SECRET...
//
// (do not commit vercel.json; share apply locally).
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_CHECK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const batch = await syncAllConnections('microsoft');
    return NextResponse.json({
      checked: batch.checked,
      synced: batch.synced,
      errors: batch.errors.map((e) => e.message),
    });
  } catch (error) {
    await logError('server', 'calendar:sync-cron', error, {
      stage: 'sync-all',
    });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}