import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { CalendarProvider } from '@/lib/calendar/types';
import { encryptToken } from '@/lib/calendar/tokens';

export interface CalendarConnectionRow {
  id: string;
  user_id: string;
  provider: string;
  connected_email: string | null;
  provider_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string | null;
  last_sync_at: string | null;
  sync_status: 'ok' | 'error';
  sync_error: string | null;
}

export interface CalendarEventRow {
  connection_id: string;
  user_id: string;
  provider: string;
  calendar_id: string | null;
  provider_event_id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  status: string;
  source_url: string | null;
  last_modified: string | null;
}

export interface ExternalCalendarRow {
  id: string;
  connection_id: string;
  user_id: string;
  provider: string;
  provider_calendar_id: string;
  name: string;
  is_default: boolean;
  selected: boolean;
}

const CONNECTION_COLUMNS =
  'id,user_id,provider,connected_email,provider_account_id,access_token,refresh_token,expires_at,scopes,last_sync_at,sync_status,sync_error';

export function connectionKey(
  userId: string,
  provider: CalendarProvider,
  providerAccountId: string
): string {
  return `${userId}:${provider}:${providerAccountId}`;
}

export async function listCalendarConnections(provider?: CalendarProvider) {
  let query = supabaseAdmin
    .from('calendar_connections')
    .select(CONNECTION_COLUMNS);
  if (provider) {
    query = query.eq('provider', provider);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list calendar connections: ${error.message}`);
  }
  return (data ?? []) as CalendarConnectionRow[];
}

export interface UpsertConnectionInput {
  userId: string;
  provider: CalendarProvider;
  providerAccountId: string;
  connectedEmail: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string | null;
}

export async function upsertConnection(
  input: UpsertConnectionInput
): Promise<CalendarConnectionRow> {
  const { data, error } = await supabaseAdmin
    .from('calendar_connections')
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        connected_email: input.connectedEmail,
        access_token: encryptToken(input.accessToken),
        refresh_token: encryptToken(input.refreshToken),
        expires_at: input.expiresAt,
        scopes: input.scopes,
      },
      { onConflict: 'user_id,provider,provider_account_id' }
    )
    .select(CONNECTION_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`Failed to save calendar connection: ${error?.message ?? 'no row'}`);
  }
  return data as CalendarConnectionRow;
}

export async function updateConnectionTokens(
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string | null
) {
  const { error } = await supabaseAdmin
    .from('calendar_connections')
    .update({
      access_token: encryptToken(accessToken),
      refresh_token: encryptToken(refreshToken),
      expires_at: expiresAt,
    })
    .eq('id', connectionId);
  if (error) {
    throw new Error(`Failed to save refreshed tokens: ${error.message}`);
  }
}

export async function updateConnectionSyncStatus(
  connectionId: string,
  status: 'ok' | 'error',
  syncError: string | null,
  lastSyncAt?: string
) {
  const { error } = await supabaseAdmin
    .from('calendar_connections')
    .update({
      sync_status: status,
      sync_error: syncError,
      ...(lastSyncAt ? { last_sync_at: lastSyncAt } : {}),
    })
    .eq('id', connectionId);
  if (error) {
    throw new Error(`Failed to update connection sync status: ${error.message}`);
  }
}

export interface SyncWindow {
  startUtc: string;
  endUtc: string;
}

export async function replaceCalendarEvents(
  connectionId: string,
  userId: string,
  provider: CalendarProvider,
  events: Array<{
    id: string;
    calendarId: string | null;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    location: string | null;
    description: string | null;
    status: string;
    sourceUrl: string | null;
    lastModified: string | null;
  }>,
  window: SyncWindow
): Promise<{ upserted: number; cancelled: number }> {
  let upserted = 0;
  if (events.length > 0) {
    const rows = events.map((e) => ({
      connection_id: connectionId,
      user_id: userId,
      provider,
      calendar_id: e.calendarId,
      provider_event_id: e.id,
      title: e.title,
      start_at: e.start,
      end_at: e.end,
      all_day: e.allDay,
      location: e.location,
      description: e.description,
      status: e.status,
      source_url: e.sourceUrl,
      last_modified: e.lastModified,
    }));
    const { data, error } = await supabaseAdmin
      .from('calendar_events')
      .upsert(rows, { onConflict: 'connection_id,provider,provider_event_id' })
      .select('id');
    if (error) {
      throw new Error(`Failed to upsert calendar events: ${error.message}`);
    }
    upserted = data?.length ?? 0;
  }

  // Reconcile the fetch window: previously stored events that are no longer
  // returned (deleted, or moved outside the window) stop being active
  // commitments so they no longer consume the user's capacity.
  const fetchedIds = events
    .filter((e) => e.status !== 'cancelled')
    .map((e) => e.id);
  let reconcile = supabaseAdmin
    .from('calendar_events')
    .update({ status: 'cancelled' })
    .eq('connection_id', connectionId)
    .eq('provider', provider)
    .neq('status', 'cancelled')
    .gte('end_at', window.startUtc)
    .lt('start_at', window.endUtc);
  for (const id of fetchedIds) {
    reconcile = reconcile.neq('provider_event_id', id);
  }
  const { data: cancelledRows, error: cancelError } = await reconcile.select('id');
  if (cancelError) {
    throw new Error(`Failed to reconcile cancelled events: ${cancelError.message}`);
  }

  return { upserted, cancelled: cancelledRows?.length ?? 0 };
}

export async function deleteConnectionsForUser(
  userId: string,
  provider: CalendarProvider
) {
  const { error } = await supabaseAdmin
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) {
    throw new Error(`Failed to delete calendar connection: ${error.message}`);
  }
}

export async function deleteLegacyOutlookMeetings(userId: string) {
  const { error } = await supabaseAdmin
    .from('meetings')
    .delete()
    .eq('user_id', userId)
    .eq('source', 'outlook');
  if (error) {
    throw new Error(`Failed to delete legacy meetings: ${error.message}`);
  }
}

const EXTERNAL_CALENDAR_COLUMNS =
  'id,connection_id,user_id,provider,provider_calendar_id,name,is_default,selected';

export async function listExternalCalendars(
  connectionId: string
): Promise<ExternalCalendarRow[]> {
  const { data, error } = await supabaseAdmin
    .from('external_calendars')
    .select(EXTERNAL_CALENDAR_COLUMNS)
    .eq('connection_id', connectionId);
  if (error) {
    throw new Error(`Failed to list external calendars: ${error.message}`);
  }
  return (data ?? []) as ExternalCalendarRow[];
}

export async function listUserExternalCalendars(
  userId: string
): Promise<ExternalCalendarRow[]> {
  const { data, error } = await supabaseAdmin
    .from('external_calendars')
    .select(EXTERNAL_CALENDAR_COLUMNS)
    .eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to list external calendars: ${error.message}`);
  }
  return (data ?? []) as ExternalCalendarRow[];
}

export interface SyncExternalCalendarInput {
  providerCalendarId: string;
  name: string;
  isDefault: boolean;
  selected: boolean;
}

// Persists the discovered calendars of one connection, preserving each
// calendar's stored selection (computed separately by planCalendarSelection).
// Calendars Microsoft no longer returns are deselected so their state is
// never ambiguous. Returns the full current set for the connection.
export async function syncExternalCalendars(
  connectionId: string,
  userId: string,
  provider: CalendarProvider,
  discovered: SyncExternalCalendarInput[]
): Promise<ExternalCalendarRow[]> {
  const presentIds = discovered.map((d) => d.providerCalendarId);
  if (discovered.length > 0) {
    const { error } = await supabaseAdmin.from('external_calendars').upsert(
      discovered.map((d) => ({
        connection_id: connectionId,
        user_id: userId,
        provider,
        provider_calendar_id: d.providerCalendarId,
        name: d.name,
        is_default: d.isDefault,
        selected: d.selected,
      })),
      { onConflict: 'connection_id,provider,provider_calendar_id' }
    );
    if (error) {
      throw new Error(`Failed to sync external calendars: ${error.message}`);
    }
  }
  await markVanishedCalendarsUnselected(connectionId, provider, presentIds);
  return listExternalCalendars(connectionId);
}

async function markVanishedCalendarsUnselected(
  connectionId: string,
  provider: string,
  presentIds: string[]
) {
  let query = supabaseAdmin
    .from('external_calendars')
    .update({ selected: false })
    .eq('connection_id', connectionId)
    .eq('provider', provider);
  if (presentIds.length > 0) {
    query = query.not('provider_calendar_id', 'in', presentIds);
  }
  const { error } = await query;
  if (error) {
    throw new Error(`Failed to unselect removed calendars: ${error.message}`);
  }
}

// Updates the user's selection for one calendar. Ownership is enforced with a
// user_id filter (returns null when the calendar is not the caller's), and
// deselecting immediately cancels the calendar's cached events so they stop
// consuming Today capacity without waiting for the next sync. Re-selecting
// revives them on the next sync's upsert.
export async function setExternalCalendarSelected(
  calendarId: string,
  userId: string,
  selected: boolean
): Promise<ExternalCalendarRow | null> {
  const { data, error } = await supabaseAdmin
    .from('external_calendars')
    .update({ selected })
    .eq('id', calendarId)
    .eq('user_id', userId)
    .select(EXTERNAL_CALENDAR_COLUMNS)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to update calendar selection: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  if (!selected) {
    const { error: cancelError } = await supabaseAdmin
      .from('calendar_events')
      .update({ status: 'cancelled' })
      .eq('calendar_id', calendarId)
      .neq('status', 'cancelled');
    if (cancelError) {
      throw new Error(
        `Failed to cancel deselected calendar events: ${cancelError.message}`
      );
    }
  }
  return data as ExternalCalendarRow;
}