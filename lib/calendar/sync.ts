import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logError } from '@/lib/logError';
import {
  fetchCalendarEvents,
  fetchCalendars,
  refreshAccessToken,
} from '@/lib/microsoftGraph';
import { normalizeMicrosoftEvents } from '@/lib/calendar/microsoft/normalize';
import {
  normalizeMicrosoftCalendars,
  type DiscoveredCalendar,
} from '@/lib/calendar/microsoft/calendars';
import { planCalendarSelection } from '@/lib/calendar/selection';
import {
  deleteConnectionsForUser,
  deleteLegacyOutlookMeetings,
  listCalendarConnections,
  listExternalCalendars,
  replaceCalendarEvents,
  syncExternalCalendars,
  updateConnectionSyncStatus,
  updateConnectionTokens,
  type CalendarConnectionRow,
  type ExternalCalendarRow,
} from '@/lib/calendar/store';
import { decryptToken } from '@/lib/calendar/tokens';
import type {
  CalendarProvider,
  ExternalCalendarEvent,
  SyncResult,
} from '@/lib/calendar/types';
import { localDayBounds } from '@/lib/calendar/time';

const SYNC_HORIZON_DAYS = 1;
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export async function getUserTimeZone(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.timezone || null;
}

export function computeSyncWindow(
  userTimeZone: string,
  now = new Date()
): { startUtc: string; endUtc: string } {
  const localToday = localDayBounds(
    now.toISOString().slice(0, 10),
    userTimeZone,
    userTimeZone
  );
  const startRow = localDayBounds(
    new Date(localToday.startUtc.getTime() - SYNC_HORIZON_DAYS * 86400000)
      .toISOString()
      .slice(0, 10),
    userTimeZone,
    userTimeZone
  );
  const endRow = localDayBounds(
    new Date(localToday.endUtc.getTime() + SYNC_HORIZON_DAYS * 86400000)
      .toISOString()
      .slice(0, 10),
    userTimeZone,
    userTimeZone
  );
  return { startUtc: startRow.startUtc.toISOString(), endUtc: endRow.endUtc.toISOString() };
}

const TOKEN_REFRESH_LEAD_TIME_MS = 90 * 1000;

async function getAccessToken(
  connection: CalendarConnectionRow
): Promise<{ token: string; refreshed: boolean }> {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (connection.access_token && expiresAt - TOKEN_REFRESH_LEAD_TIME_MS > Date.now()) {
    return { token: decryptToken(connection.access_token), refreshed: false };
  }
  if (!connection.refresh_token) {
    throw new Error('Connection has no refresh token');
  }
  const tokens = await refreshAccessToken(decryptToken(connection.refresh_token));
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token || decryptToken(connection.refresh_token);
  if (!accessToken) {
    throw new Error('Token refresh returned no access token');
  }
  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  await updateConnectionTokens(connection.id, accessToken, refreshToken, expiresAtIso);
  return { token: accessToken, refreshed: true };
}

export async function syncConnection(
  connection: CalendarConnectionRow
): Promise<SyncResult> {
  if (connection.provider !== 'microsoft') {
    throw new Error(`Unsupported calendar provider: ${connection.provider}`);
  }

  const lastSyncAt = connection.last_sync_at
    ? new Date(connection.last_sync_at).getTime()
    : 0;
  if (Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    return {
      connectionId: connection.id,
      eventsUpserted: 0,
      eventsCancelled: 0,
      fetchedAt: connection.last_sync_at ?? new Date().toISOString(),
    };
  }

  const userTimeZone = (await getUserTimeZone(connection.user_id)) || 'UTC';
  const window = computeSyncWindow(userTimeZone);
  const { token: accessToken } = await getAccessToken(connection);

  // Discover the account's calendars, persist them with their selection
  // state, then fetch events ONLY from the selected ones — a deselected
  // calendar (Birthdays, shared calendars, ...) never contributes External
  // Commitments. Its previously stored events are reconciled to cancelled
  // below because they are no longer returned.
  const discovered = normalizeMicrosoftCalendars(
    await fetchCalendars(accessToken)
  );
  const calendars = await planAndPersistCalendars(connection, discovered);
  const selectedCalendars = calendars.filter((c) => c.selected);

  const normalized: ExternalCalendarEvent[] = [];
  for (const calendar of selectedCalendars) {
    const rawEvents = await fetchCalendarEvents(
      accessToken,
      calendar.provider_calendar_id,
      new Date(window.startUtc),
      new Date(window.endUtc)
    );
    normalized.push(
      ...normalizeMicrosoftEvents(
        rawEvents,
        connection.provider_account_id,
        userTimeZone,
        calendar.id
      )
    );
  }

  const result = await replaceCalendarEvents(
    connection.id,
    connection.user_id,
    'microsoft',
    normalized,
    window
  );

  const fetchedAt = new Date().toISOString();
  await updateConnectionSyncStatus(connection.id, 'ok', null, fetchedAt);
  return {
    connectionId: connection.id,
    eventsUpserted: result.upserted,
    eventsCancelled: result.cancelled,
    fetchedAt,
  };
}

// Discovers and persists the account's calendars without fetching events.
// Used right after OAuth connect so Preferences can show the calendars (with
// the default already selected) before the first cron sync. Best-effort: a
// failure here only delays the calendar list, never the connection.
export async function seedConnectionCalendars(
  connection: CalendarConnectionRow
): Promise<void> {
  if (connection.provider !== 'microsoft') {
    throw new Error(`Unsupported calendar provider: ${connection.provider}`);
  }
  const { token: accessToken } = await getAccessToken(connection);
  const discovered = normalizeMicrosoftCalendars(
    await fetchCalendars(accessToken)
  );
  await planAndPersistCalendars(connection, discovered);
}

async function planAndPersistCalendars(
  connection: CalendarConnectionRow,
  discovered: DiscoveredCalendar[]
): Promise<ExternalCalendarRow[]> {
  const existing = await listExternalCalendars(connection.id);
  const plan = planCalendarSelection(discovered, existing);
  const selectedById = new Map(
    plan.map((p) => [p.providerCalendarId, p.selected])
  );
  return syncExternalCalendars(
    connection.id,
    connection.user_id,
    'microsoft',
    discovered.map((d) => ({
      providerCalendarId: d.providerCalendarId,
      name: d.name,
      isDefault: d.isDefault,
      selected: selectedById.get(d.providerCalendarId) ?? false,
    }))
  );
}

export interface CalendarSyncBatch {
  checked: number;
  synced: number;
  results: SyncResult[];
  errors: Array<{ connectionId: string; message: string }>;
}

export async function syncAllConnections(
  provider?: CalendarProvider
): Promise<CalendarSyncBatch> {
  const connections = await listCalendarConnections(provider);
  const results: SyncResult[] = [];
  const errors: CalendarSyncBatch['errors'] = [];

  for (const connection of connections) {
    try {
      results.push(await syncConnection(connection));
    } catch (error) {
      await updateConnectionSyncStatus(
        connection.id,
        'error',
        safeErrorMessage(error)
      );
      await logError(
        'server',
        'calendar:sync',
        error,
        { connectionId: connection.id, provider: connection.provider },
        connection.user_id
      );
      errors.push({
        connectionId: connection.id,
        message: safeErrorMessage(error),
      });
    }
  }

  return { checked: connections.length, synced: results.length, results, errors };
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message.split('\n')[0] : String(error);
  return message.slice(0, 300);
}

export async function clearConnection(
  userId: string,
  provider: CalendarProvider
) {
  await deleteConnectionsForUser(userId, provider);
  if (provider === 'microsoft') {
    await deleteLegacyOutlookMeetings(userId);
  }
}