import { describe, expect, it } from 'vitest';
import type { MicrosoftGraphEvent } from '@/lib/microsoftGraph';
import {
  PROVIDER,
  normalizeMicrosoftEvent,
  normalizeMicrosoftEvents,
} from '@/lib/calendar/microsoft/normalize';

function raw(partial: Partial<MicrosoftGraphEvent>): MicrosoftGraphEvent {
  return {
    id: 'event-1',
    subject: 'Roofing walkthrough',
    start: { dateTime: '2026-09-08T10:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-08T11:30:00.0000000', timeZone: 'UTC' },
    isAllDayEvent: false,
    isCancelled: false,
    showAs: 'busy',
    ...partial,
  };
}

describe('normalizeMicrosoftEvent', () => {
  it('normalizes a timed event into an external commitment', () => {
    const event = normalizeMicrosoftEvent(
      raw({
        location: { displayName: 'Job site' },
        webLink: 'https://outlook.live.com/owa/item/1',
        lastModifiedDateTime: '2026-09-07T21:00:00Z',
      }),
      'acct-123',
      'UTC'
    );
    expect(event).toMatchObject({
      id: 'event-1',
      provider: PROVIDER,
      providerAccountId: 'acct-123',
      title: 'Roofing walkthrough',
      start: '2026-09-08T10:00:00.000Z',
      end: '2026-09-08T11:30:00.000Z',
      allDay: false,
      location: 'Job site',
      status: 'confirmed',
      sourceUrl: 'https://outlook.live.com/owa/item/1',
      lastModified: '2026-09-07T21:00:00Z',
    });
  });

  it('converts all-day events into the user-local day bounds', () => {
    const event = normalizeMicrosoftEvent(
      raw({
        isAllDayEvent: true,
        showAs: 'free',
        start: { dateTime: '2026-03-08T00:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-03-09T00:00:00.0000000', timeZone: 'UTC' },
      }),
      'acct-123',
      'America/New_York'
    );
    expect(event.allDay).toBe(true);
    expect(event.start).toBe('2026-03-08T05:00:00.000Z');
    expect(event.end).toBe('2026-03-09T04:00:00.000Z');
  });

  it('marks cancelled events as cancelled', () => {
    expect(
      normalizeMicrosoftEvent(raw({ isCancelled: true }), 'a', 'UTC').status
    ).toBe('cancelled');
  });

  it('marks tentative events as tentative', () => {
    expect(
      normalizeMicrosoftEvent(raw({ showAs: 'tentative' }), 'a', 'UTC').status
    ).toBe('tentative');
  });

  it('carries the external calendar id onto the event', () => {
    expect(
      normalizeMicrosoftEvent(raw({}), 'acct-123', 'UTC', 'cal-db-1').calendarId
    ).toBe('cal-db-1');
  });

  it('defaults the calendar id to null when unknown', () => {
    expect(
      normalizeMicrosoftEvent(raw({}), 'acct-123', 'UTC').calendarId
    ).toBeNull();
  });

  it('provides sensible defaults for missing display fields', () => {
    const event = normalizeMicrosoftEvent(raw({ subject: null, location: null }), 'a', 'UTC');
    expect(event.title).toBe('(Untitled event)');
    expect(event.location).toBeNull();
    expect(event.description).toBeNull();
  });

  it('rejects an all-day event with no date', () => {
    expect(() =>
      normalizeMicrosoftEvent(
        raw({ isAllDayEvent: true, start: { dateTime: '', timeZone: '' } }),
        'a',
        'UTC'
      )
    ).toThrow();
  });

  it('rejects an event that ends before it starts', () => {
    expect(() =>
      normalizeMicrosoftEvent(
        raw({
          start: { dateTime: '2026-09-08T12:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2026-09-08T11:00:00Z', timeZone: 'UTC' },
        }),
        'a',
        'UTC'
      )
    ).toThrow();
  });
});

describe('normalizeMicrosoftEvents', () => {
  it('skips malformed events without dropping the valid ones', () => {
    const events = normalizeMicrosoftEvents(
      [
        raw({ id: 'good', subject: 'A' }),
        raw({ id: 'bad', start: { dateTime: '', timeZone: '' } }),
        raw({ id: 'good-2', subject: 'B' }),
      ],
      'acct-123',
      'UTC'
    );
    expect(events.map((e) => e.id)).toEqual(['good', 'good-2']);
  });

  it('applies the same calendar id to every event in a batch', () => {
    const events = normalizeMicrosoftEvents(
      [raw({ id: 'a' }), raw({ id: 'b' })],
      'acct-123',
      'UTC',
      'cal-db-2'
    );
    expect(events.map((e) => e.calendarId)).toEqual(['cal-db-2', 'cal-db-2']);
  });
});