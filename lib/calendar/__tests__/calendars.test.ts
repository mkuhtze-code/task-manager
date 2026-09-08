import { describe, expect, it } from 'vitest';
import type { MicrosoftGraphCalendar } from '@/lib/microsoftGraph';
import {
  CALENDAR_PROVIDER,
  normalizeMicrosoftCalendar,
  normalizeMicrosoftCalendars,
  pickDefaultCalendarId,
} from '@/lib/calendar/microsoft/calendars';

function raw(partial: Partial<MicrosoftGraphCalendar>): MicrosoftGraphCalendar {
  return {
    id: 'calendar-1',
    name: 'Work',
    isDefaultCalendar: false,
    ...partial,
  };
}

describe('normalizeMicrosoftCalendar', () => {
  it('maps the stable calendar id, name and default flag', () => {
    const calendar = normalizeMicrosoftCalendar(
      raw({ id: 'cal-9', name: 'Personal', isDefaultCalendar: true })
    );
    expect(calendar).toEqual({
      providerCalendarId: 'cal-9',
      name: 'Personal',
      isDefault: true,
    });
    expect(CALENDAR_PROVIDER).toBe('microsoft');
  });

  it('handles missing optional display metadata', () => {
    const calendar = normalizeMicrosoftCalendar(
      raw({ name: null, color: null, owner: null })
    );
    expect(calendar.name).toBe('(Untitled calendar)');
    expect(calendar.isDefault).toBe(false);
  });

  it('rejects a calendar without a stable id', () => {
    expect(() => normalizeMicrosoftCalendar(raw({ id: ' ' }))).toThrow();
  });
});

describe('normalizeMicrosoftCalendars', () => {
  it('normalizes calendars and skips malformed ones', () => {
    const calendars = normalizeMicrosoftCalendars([
      raw({ id: 'a', name: 'Work' }),
      raw({ id: '  ', name: 'Broken' }),
      raw({ id: 'b', name: 'Birthdays', isDefaultCalendar: true }),
    ]);
    expect(calendars).toEqual([
      { providerCalendarId: 'a', name: 'Work', isDefault: false },
      { providerCalendarId: 'b', name: 'Birthdays', isDefault: true },
    ]);
  });
});

describe('pickDefaultCalendarId', () => {
  it('returns the Microsoft-flagged default calendar', () => {
    const calendars = normalizeMicrosoftCalendars([
      raw({ id: 'work', name: 'Work' }),
      raw({ id: 'default-cal', name: 'My Calendar', isDefaultCalendar: true }),
    ]);
    expect(pickDefaultCalendarId(calendars)).toBe('default-cal');
  });

  it('falls back deterministically to the first calendar by name', () => {
    const calendars = normalizeMicrosoftCalendars([
      raw({ id: 'z', name: 'Zeta' }),
      raw({ id: 'a', name: 'Alpha' }),
      raw({ id: 'm', name: 'Beta' }),
    ]);
    expect(pickDefaultCalendarId(calendars)).toBe('a');
  });

  it('returns null when there are no calendars', () => {
    expect(pickDefaultCalendarId([])).toBeNull();
  });
});