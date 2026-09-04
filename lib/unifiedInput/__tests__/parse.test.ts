import { describe, expect, it } from 'vitest';
import { parseThought, looksLikeRoadPhrase } from '@/lib/unifiedInput/parse';

const TODAY = '2026-09-04'; // a Friday

describe('parseThought', () => {
  it('resolves the acceptance example end to end', () => {
    const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
    // tomorrow (Fri 2026-09-04) → Sat 2026-09-05
    expect(parts.date).toBe('2026-09-05');
    expect(parts.time?.hour).toBe(10);
    expect(parts.time?.minute).toBe(0);
    expect(parts.locationHint).toBe('Belgium Rd');
    expect(parts.hadFacets).toBe(true);
    expect(parts.intent).toBe('measure Rainwater Head');
    expect(parts.originalInput).toBe('Belgium Rd tomorrow at 10am to measure Rainwater Head');
  });

  it('leaves plain task text completely untouched', () => {
    const parts = parseThought('Call the dentist', TODAY);
    expect(parts.intent).toBe('Call the dentist');
    expect(parts.date).toBeNull();
    expect(parts.time).toBeNull();
    expect(parts.locationHint).toBeNull();
    expect(parts.hadFacets).toBe(false);
  });

  it('parses a time with a leading "at"', () => {
    const parts = parseThought('measure Rainwater Head at 10:30am', TODAY);
    expect(parts.time?.hour).toBe(10);
    expect(parts.time?.minute).toBe(30);
    expect(parts.intent.toLowerCase()).toBe('measure rainwater head');
  });

  it('parses a 24h clock time', () => {
    const parts = parseThought('meet at 14:00', TODAY);
    expect(parts.time?.hour).toBe(14);
    expect(parts.time?.minute).toBe(0);
  });

  it('parses an afternoon pm time and normalises 12am', () => {
    expect(parseThought('call at 7pm', TODAY).time?.hour).toBe(19);
    expect(parseThought('midnight shift at 12am', TODAY).time?.hour).toBe(0);
    expect(parseThought('lunch at 12pm', TODAY).time?.hour).toBe(12);
  });

  it('parses tomorrow / today / tonight', () => {
    expect(parseThought('do it tomorrow', TODAY).date).toBe('2026-09-05');
    expect(parseThought('do it today', TODAY).date).toBe('2026-09-04');
    expect(parseThought('do it tonight', TODAY).date).toBe('2026-09-04');
  });

  it('parses a future weekday name', () => {
    // Friday 2026-09-04 → next Monday is 2026-09-07
    expect(parseThought('meet on monday', TODAY).date).toBe('2026-09-07');
    expect(parseThought('meet next monday', TODAY).date).toBe('2026-09-14');
  });

  it('recognises road-type location phrases', () => {
    expect(looksLikeRoadPhrase('Belgium Rd')).toBe(true);
    expect(looksLikeRoadPhrase('14 Belgium Road')).toBe(true);
    expect(looksLikeRoadPhrase('Valley Avenue')).toBe(true);
    expect(looksLikeRoadPhrase('call the dentist')).toBe(false);
    expect(looksLikeRoadPhrase('measure Rainwater Head')).toBe(false);
  });

  it('keeps the intent whole when only a time is present (no road phrase)', () => {
    const parts = parseThought('mow the lawn tomorrow', TODAY);
    expect(parts.intent.toLowerCase()).toBe('mow the lawn');
    expect(parts.date).toBe('2026-09-05');
  });
});
