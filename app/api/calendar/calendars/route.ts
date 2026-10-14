import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { assertCanUseFeature } from '@/lib/billing/serverEntitlements';
import { checkRateLimit } from '@/lib/ratelimit';
import {
  getCalendarConnectionForUser,
  listCalendarConnections,
  listUserExternalCalendars,
  setExternalCalendarSelected,
  updateConnectionSyncStatus,
  type ExternalCalendarRow,
} from '@/lib/calendar/store';
import { syncConnection } from '@/lib/calendar/sync';
import { logError } from '@/lib/logError';

export async function GET(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const gate = await assertCanUseFeature(auth.userId, 'calendar');
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }


  // Microsoft connections + their calendars. Ownership is enforced by the
  // user-scoped store query; the response never carries OAuth tokens.
  const connections = await listCalendarConnections('microsoft');
  const calendars = await listUserExternalCalendars(auth.userId);
  const connectionIds = new Set(connections.map((c) => c.id));

  const byConnection = new Map<string, ExternalCalendarRow[]>();
  for (const calendar of calendars) {
    if (!connectionIds.has(calendar.connection_id)) {
      continue;
    }
    const group = byConnection.get(calendar.connection_id) ?? [];
    group.push(calendar);
    byConnection.set(calendar.connection_id, group);
  }

  return NextResponse.json({
    connections: connections.map((conn) => ({
      connection_id: conn.id,
      provider: conn.provider,
      connected_email: conn.connected_email,
      calendars: (byConnection.get(conn.id) ?? []).map((row) => ({
        id: row.id,
        provider_calendar_id: row.provider_calendar_id,
        name: row.name,
        is_default: row.is_default,
        selected: row.selected,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const gate = await assertCanUseFeature(auth.userId, 'calendar');
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }


  const { allowed } = await checkRateLimit(`user:${auth.userId}:calendar-select`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again shortly.' },
      { status: 429 }
    );
  }

  let body: { calendarId?: unknown; selected?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const calendarId = body?.calendarId;
  const selected = body?.selected;
  if (typeof calendarId !== 'string' || typeof selected !== 'boolean') {
    return NextResponse.json(
      { error: 'calendarId (string) and selected (boolean) are required' },
      { status: 400 }
    );
  }

  // setExternalCalendarSelected filters on user_id, so a calendar id that
  // belongs to another user simply does not resolve.
  const row = await setExternalCalendarSelected(calendarId, auth.userId, selected);
  if (!row) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 });
  }

  let connectionId: string | null = null;
  let syncError: string | null = null;
  try {
    const connection = await getCalendarConnectionForUser(row.connection_id, auth.userId);
    if (!connection) {
      throw new Error('Calendar connection not found for this account');
    }
    connectionId = connection.id;
    await syncConnection(connection, { force: true });
  } catch (error) {
    syncError = (
      error instanceof Error
        ? error.message.split(String.fromCharCode(10))[0]
        : 'Calendar sync failed'
    ).slice(0, 300);

    if (connectionId) {
      try {
        await updateConnectionSyncStatus(connectionId, 'error', syncError);
      } catch (statusError) {
        await logError('server', 'calendar:selection-sync', statusError, {
          stage: 'record-sync-error',
          connectionId,
          calendarId: row.id,
        }, auth.userId);
      }
    }
    await logError('server', 'calendar:selection-sync', error, {
      stage: 'sync-selected-calendar',
      connectionId: row.connection_id,
      calendarId: row.id,
    }, auth.userId);
  }

  return NextResponse.json({
    ok: true,
    syncStatus: syncError ? 'error' : 'ok',
    syncError: syncError
      ? 'Calendar selection was saved, but syncing changes failed. Try again shortly.'
      : null,
    calendar: {
      id: row.id,
      name: row.name,
      is_default: row.is_default,
      selected: row.selected,
    },
  });
}
