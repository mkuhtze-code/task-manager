import { describe, expect, it } from 'vitest';
import {
  externalCalendarKey,
  planCalendarSelection,
} from '@/lib/calendar/selection';
import type { DiscoveredCalendar } from '@/lib/calendar/microsoft/calendars';
import { ownsExternalCalendar, assertOwnsExternalCalendar } from '@/lib/calendar/access';

function discovered(
  partial: Partial<DiscoveredCalendar> & { providerCalendarId: string }
): DiscoveredCalendar {
  return { name: 'Work', isDefault: false, ...partial };
}

describe('planCalendarSelection — first connection', () => {
  it('selects only the default calendar, leaving everything else unselected', () => {
    const plan = planCalendarSelection(
      [
        discovered({ providerCalendarId: 'default-cal', isDefault: true }),
        discovered({ providerCalendarId: 'birthdays' }),
        discovered({ providerCalendarId: 'team' }),
      ],
      []
    );
    expect(plan).toEqual([
      { providerCalendarId: 'default-cal', selected: true },
      { providerCalendarId: 'birthdays', selected: false },
      { providerCalendarId: 'team', selected: false },
    ]);
  });

  it('falls back to the deterministic default when none is flagged', () => {
    // Supplying no isDefaultCalendar flag triggers the documented fallback,
    // so exactly one calendar is chosen (first by name) and selected.
    const plan = planCalendarSelection(
      [
        discovered({ providerCalendarId: 'zeta', name: 'Zeta' }),
        discovered({ providerCalendarId: 'alpha', name: 'Alpha' }),
      ],
      []
    );
    expect(plan).toEqual([
      { providerCalendarId: 'zeta', selected: false },
      { providerCalendarId: 'alpha', selected: true },
    ]);
  });
});

describe('planCalendarSelection — preserving user choices', () => {
  it('keeps a calendar selected across syncs', () => {
    const plan = planCalendarSelection(
      [discovered({ providerCalendarId: 'team', isDefault: false })],
      [{ provider_calendar_id: 'team', selected: true }]
    );
    expect(plan).toEqual([{ providerCalendarId: 'team', selected: true }]);
  });

  it('keeps a deselected calendar deselected even when it is the default', () => {
    const plan = planCalendarSelection(
      [discovered({ providerCalendarId: 'default-cal', isDefault: true })],
      [{ provider_calendar_id: 'default-cal', selected: false }]
    );
    expect(plan).toEqual([{ providerCalendarId: 'default-cal', selected: false }]);
  });

  it('reselection persists: a re-selected non-default calendar stays selected', () => {
    const plan = planCalendarSelection(
      [
        discovered({ providerCalendarId: 'work', isDefault: true }),
        discovered({ providerCalendarId: 'personal' }),
      ],
      [{ provider_calendar_id: 'personal', selected: true }]
    );
    expect(plan).toEqual([
      { providerCalendarId: 'work', selected: true },
      { providerCalendarId: 'personal', selected: true },
    ]);
  });
});

describe('planCalendarSelection — newly discovered calendars', () => {
  it('does not silently select a newly discovered non-default calendar', () => {
    const previous = [
      discovered({ providerCalendarId: 'work', isDefault: true }),
    ];
    const plan = planCalendarSelection(
      [
        discovered({ providerCalendarId: 'work', isDefault: true }),
        discovered({ providerCalendarId: 'holidays' }),
      ],
      [{ provider_calendar_id: 'work', selected: true }]
    );
    expect(plan).toEqual([
      { providerCalendarId: 'work', selected: true },
      { providerCalendarId: 'holidays', selected: false },
    ]);
    expect(previous[0].providerCalendarId).toBe('work');
  });

  it('selects a newly discovered default calendar on first sight', () => {
    const plan = planCalendarSelection(
      [
        discovered({ providerCalendarId: 'existing' }),
        discovered({ providerCalendarId: 'fresh-default', isDefault: true }),
      ],
      [{ provider_calendar_id: 'existing', selected: true }]
    );
    expect(plan).toEqual([
      { providerCalendarId: 'existing', selected: true },
      { providerCalendarId: 'fresh-default', selected: true },
    ]);
  });
});

describe('externalCalendarKey — selection is scoped to the connection', () => {
  it('splits the same provider calendar id across two accounts', () => {
    expect(
      externalCalendarKey('work-conn', 'microsoft', 'calendar-1')
    ).not.toBe(
      externalCalendarKey('personal-conn', 'microsoft', 'calendar-1')
    );
  });

  it('splits by provider so Google never collides with Microsoft', () => {
    expect(
      externalCalendarKey('conn', 'microsoft', 'calendar-1')
    ).not.toBe(externalCalendarKey('conn', 'google', 'calendar-1'));
  });

  it('is deterministic for the same inputs', () => {
    expect(externalCalendarKey('conn', 'microsoft', 'calendar-1')).toBe(
      externalCalendarKey('conn', 'microsoft', 'calendar-1')
    );
  });
});

describe('calendar ownership enforcement', () => {
  it('allows a user to manage their own calendar', () => {
    expect(ownsExternalCalendar({ user_id: 'me' }, 'me')).toBe(true);
  });

  it("blocks a user from another user's calendar", () => {
    expect(ownsExternalCalendar({ user_id: 'me' }, 'other')).toBe(false);
  });

  it('assertOwnsExternalCalendar throws for a foreign calendar', () => {
    expect(() =>
      assertOwnsExternalCalendar({ user_id: 'me' }, 'other')
    ).toThrow();
  });

  it('assertOwnsExternalCalendar passes for an owned calendar', () => {
    expect(() =>
      assertOwnsExternalCalendar({ user_id: 'me' }, 'me')
    ).not.toThrow();
  });
});