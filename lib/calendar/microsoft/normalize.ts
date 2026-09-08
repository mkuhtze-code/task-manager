import type { MicrosoftGraphEvent } from '@/lib/microsoftGraph';
import type {
  CalendarProvider,
  ExternalCalendarEvent,
  ExternalCommitmentStatus,
} from '@/lib/calendar/types';
import { localDayBounds, zonedToUtc } from '@/lib/calendar/time';

export const PROVIDER: CalendarProvider = 'microsoft';

function normalizeStatus(
  event: MicrosoftGraphEvent
): ExternalCommitmentStatus {
  if (event.isCancelled) {
    return 'cancelled';
  }
  if (event.showAs === 'tentative') {
    return 'tentative';
  }
  return 'confirmed';
}

export function normalizeMicrosoftEvent(
  raw: MicrosoftGraphEvent,
  providerAccountId: string,
  userTimeZone = 'UTC',
  calendarId: string | null = null
): ExternalCalendarEvent {
  const isAllDay = Boolean(raw.isAllDayEvent);

  let start: Date;
  let end: Date;
  if (isAllDay) {
    const datePart = (raw.start?.dateTime ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      throw new Error(`All-day event missing date bounds: ${raw.id}`);
    }
    const bounds = localDayBounds(datePart, userTimeZone);
    start = bounds.startUtc;
    end = bounds.endUtc;
  } else {
    start = zonedToUtc(raw.start?.dateTime, raw.start?.timeZone, userTimeZone);
    end = zonedToUtc(raw.end?.dateTime, raw.end?.timeZone, userTimeZone);
    if (end.getTime() <= start.getTime()) {
      throw new Error(`Event ends before it starts: ${raw.id}`);
    }
  }

  return {
    id: raw.id,
    provider: PROVIDER,
    providerAccountId,
    calendarId,
    title: raw.subject || '(Untitled event)',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: isAllDay,
    location: raw.location?.displayName || null,
    description: raw.bodyPreview || null,
    status: normalizeStatus(raw),
    sourceUrl: raw.webLink || null,
    lastModified: raw.lastModifiedDateTime || null,
  };
}

export function normalizeMicrosoftEvents(
  rawEvents: MicrosoftGraphEvent[],
  providerAccountId: string,
  userTimeZone = 'UTC',
  calendarId: string | null = null
): ExternalCalendarEvent[] {
  return rawEvents
    .map((raw) => {
      try {
        return normalizeMicrosoftEvent(
          raw,
          providerAccountId,
          userTimeZone,
          calendarId
        );
      } catch {
        return null;
      }
    })
    .filter((event): event is ExternalCalendarEvent => event !== null);
}