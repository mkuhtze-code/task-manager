import type { MicrosoftGraphCalendar } from '@/lib/microsoftGraph';
import type { CalendarProvider } from '@/lib/calendar/types';

export const CALENDAR_PROVIDER: CalendarProvider = 'microsoft';

export interface DiscoveredCalendar {
  providerCalendarId: string;
  name: string;
  isDefault: boolean;
}

// Distills one Microsoft Graph calendar into the provider-independent shape
// used for discovery + selection. Uses the provider's stable calendar ID, never
// the name, as identity.
export function normalizeMicrosoftCalendar(
  raw: MicrosoftGraphCalendar
): DiscoveredCalendar {
  if (!raw.id || raw.id.trim().length === 0) {
    throw new Error('Calendar missing an id');
  }
  const name = raw.name?.trim();
  return {
    providerCalendarId: raw.id,
    name: name && name.length > 0 ? name : '(Untitled calendar)',
    isDefault: raw.isDefaultCalendar === true,
  };
}

export function normalizeMicrosoftCalendars(
  rawCalendars: MicrosoftGraphCalendar[]
): DiscoveredCalendar[] {
  return rawCalendars
    .map((raw) => {
      try {
        return normalizeMicrosoftCalendar(raw);
      } catch {
        return null;
      }
    })
    .filter((calendar): calendar is DiscoveredCalendar => calendar !== null);
}

// The account's default calendar is what Microsoft flags with
// isDefaultCalendar. When that metadata is missing, fall back to a safe
// deterministic pick — the first calendar in canonical name order — so the
// "exactly one default" rule still holds for accounts that omit the flag.
export function pickDefaultCalendarId(
  discovered: DiscoveredCalendar[]
): string | null {
  if (discovered.length === 0) {
    return null;
  }
  const flagged = discovered.find((d) => d.isDefault);
  if (flagged) {
    return flagged.providerCalendarId;
  }
  const ordered = [...discovered].sort((a, b) => a.name.localeCompare(b.name));
  return ordered[0].providerCalendarId;
}