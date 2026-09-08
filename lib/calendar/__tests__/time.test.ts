import { describe, expect, it } from 'vitest';
import { localDayBounds, zonedToUtc } from '@/lib/calendar/time';

describe('zonedToUtc - wall clock → UTC instant', () => {
  it('passes through explicit UTC timestamps', () => {
    expect(zonedToUtc('2026-09-08T10:00:00Z', undefined).toISOString()).toBe(
      '2026-09-08T10:00:00.000Z'
    );
  });

  it('interprets a UTC timeZone as UTC', () => {
    expect(zonedToUtc('2026-09-08T10:00:00', 'UTC').toISOString()).toBe(
      '2026-09-08T10:00:00.000Z'
    );
  });

  it('strips fractional seconds Graph appends', () => {
    expect(
      zonedToUtc('2026-09-08T10:00:00.1234567', 'UTC').toISOString()
    ).toBe('2026-09-08T10:00:00.000Z');
  });

  it('converts a fixed-offset zone', () => {
    // September pre-DST: New Zealand is UTC+12 (DST begins late September).
    expect(zonedToUtc('2026-09-09T09:00:00', 'Pacific/Auckland').toISOString()).toBe(
      '2026-09-08T21:00:00.000Z'
    );
  });

  it('is correct across a spring-forward DST transition', () => {
    expect(
      zonedToUtc('2026-03-08T09:00:00', 'America/New_York').toISOString()
    ).toBe('2026-03-08T13:00:00.000Z');
  });

  it('is correct across a fall-back DST transition', () => {
    expect(
      zonedToUtc('2026-11-01T09:00:00', 'America/New_York').toISOString()
    ).toBe('2026-11-01T14:00:00.000Z');
  });

  it('handles a mid-day time in a DST zone', () => {
    expect(
      zonedToUtc('2026-07-15T09:30:00', 'America/New_York').toISOString()
    ).toBe('2026-07-15T13:30:00.000Z');
  });

  it('throws on a missing or malformed wall clock', () => {
    expect(() => zonedToUtc(null, 'UTC')).toThrow();
    expect(() => zonedToUtc('not-a-date', 'UTC')).toThrow();
  });
});

describe('localDayBounds - all-day events in the user timezone', () => {
  it('spans the local calendar day in a DST 23-hour day', () => {
    const bounds = localDayBounds('2026-03-08', 'America/New_York');
    expect(bounds.startUtc.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('spans the local calendar day in a DST 25-hour day', () => {
    const bounds = localDayBounds('2026-11-01', 'America/New_York');
    expect(bounds.startUtc.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('spans UTC midnight for the UTC timezone', () => {
    const bounds = localDayBounds('2026-09-08', 'UTC');
    expect(bounds.startUtc.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('throws on a malformed date', () => {
    expect(() => localDayBounds('09/08/2026', 'UTC')).toThrow();
  });
});