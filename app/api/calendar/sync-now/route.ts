import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { assertCanUseFeature } from '@/lib/billing/serverEntitlements';
import { checkRateLimit } from '@/lib/ratelimit';
import {
  listUserCalendarConnections,
  updateConnectionSyncStatus,
} from '@/lib/calendar/store';
import { syncConnection } from '@/lib/calendar/sync';
import { logError } from '@/lib/logError';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const gate = await assertCanUseFeature(auth.userId, 'calendar');
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:calendar-sync-now`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many sync requests. Try again shortly.' },
      { status: 429 },
    );
  }

  let connections;
  try {
    connections = await listUserCalendarConnections(auth.userId, 'microsoft');
  } catch (error) {
    await logError('server', 'calendar:sync-now', error, { stage: 'list-connections' }, auth.userId);
    return NextResponse.json(
      { ok: false, error: 'Could not load the calendar connection. Try again shortly.' },
      { status: 500 },
    );
  }

  if (connections.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No Microsoft calendar is connected.' },
      { status: 404 },
    );
  }

  let failed = false;
  for (const connection of connections) {
    try {
      await syncConnection(connection, { force: true });
    } catch (error) {
      failed = true;
      const detail = (
        error instanceof Error
          ? error.message.split(String.fromCharCode(10))[0]
          : 'Calendar sync failed'
      ).slice(0, 300);
      try {
        await updateConnectionSyncStatus(connection.id, 'error', detail);
      } catch (statusError) {
        await logError('server', 'calendar:sync-now', statusError, {
          stage: 'record-sync-error',
          connectionId: connection.id,
        }, auth.userId);
      }
      await logError('server', 'calendar:sync-now', error, {
        stage: 'sync-connection',
        connectionId: connection.id,
      }, auth.userId);
    }
  }

  if (failed) {
    return NextResponse.json(
      {
        ok: false,
        syncStatus: 'error',
        error: 'Calendar sync did not complete. Your connection is saved; try again shortly.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    syncStatus: 'ok',
    synced: connections.length,
  });
}
