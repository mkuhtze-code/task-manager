import type { CalendarProvider } from '@/lib/calendar/types';
import type { DiscoveredCalendar } from '@/lib/calendar/microsoft/calendars';
import { pickDefaultCalendarId } from '@/lib/calendar/microsoft/calendars';

// Minimal stored state planCalendarSelection needs — keeps this module free
// of Supabase so the decision logic is unit-testable.
export interface SelectableCalendarRow {
  provider_calendar_id: string;
  selected: boolean;
}

// Decides the selected/unselected state for every calendar of ONE connection.
//
// Rules (documented behaviour):
//  * a calendar that has been seen before keeps its stored `selected` value —
//    selection is a user choice, never silently overridden by sync;
//  * a calendar that has never been seen is only auto-selected when it is the
//    account's default calendar (the one safe exception) — birthdays,
//    holidays, and shared informational calendars start unselected so they
//    never silently consume Today's capacity;
//  * on a brand-new connection this means exactly the default calendar is
//    selected and everything else is left unselected.
export function planCalendarSelection(
  discovered: DiscoveredCalendar[],
  existing: SelectableCalendarRow[]
): Array<{ providerCalendarId: string; selected: boolean }> {
  const existingByKey = new Map(
    existing.map((row) => [row.provider_calendar_id, row.selected])
  );
  const defaultId = pickDefaultCalendarId(discovered);

  return discovered.map((d) => {
    const seen = existingByKey.get(d.providerCalendarId);
    if (seen !== undefined) {
      return {
        providerCalendarId: d.providerCalendarId,
        selected: seen,
      };
    }
    return {
      providerCalendarId: d.providerCalendarId,
      selected: d.providerCalendarId === defaultId,
    };
  });
}

// Identity key for one calendar inside one connection. A calendar ID is only
// meaningful together with its connection, so the same provider calendar id on
// two different work/personal accounts never collides.
export function externalCalendarKey(
  connectionId: string,
  provider: CalendarProvider,
  providerCalendarId: string
): string {
  return `${connectionId}:${provider}:${providerCalendarId}`;
}