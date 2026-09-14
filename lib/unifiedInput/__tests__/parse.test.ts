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

  // ── V1.1: grammatical action extraction ──────────────────────────────
  it('strips a leading obligation filler so the action is the label', () => {
    expect(parseThought('I need to call the dentist', TODAY).intent.toLowerCase()).toBe('call the dentist');
    expect(parseThought('we have to fix the gate', TODAY).intent.toLowerCase()).toBe('fix the gate');
    expect(parseThought('got to run', TODAY).intent.toLowerCase()).toBe('run');
    expect(parseThought('remember to lock the door', TODAY).intent.toLowerCase()).toBe('lock the door');
    expect(parseThought("don't forget to water the plants", TODAY).intent.toLowerCase()).toBe('water the plants');
    expect(parseThought('must attend the meeting', TODAY).intent.toLowerCase()).toBe('attend the meeting');
    expect(parseThought('should call about the quote', TODAY).intent.toLowerCase()).toBe('call about the quote');
  });

  it('does not mangle a non-obligation use of "have"', () => {
    expect(parseThought('have a coffee with Sam', TODAY).intent.toLowerCase()).toBe('have a coffee with sam');
    expect(parseThought('have to hand in the report', TODAY).intent.toLowerCase()).toBe('hand in the report');
  });

  it('surfaces the cleaned action even with no date/time/location', () => {
    const parts = parseThought('I need to call the dentist', TODAY);
    expect(parts.hadFacets).toBe(true);
    expect(parts.date).toBeNull();
    expect(parts.time).toBeNull();
    expect(parts.locationHint).toBeNull();
  });

  // ── V1.1: priority / state modifier facets ───────────────────────────
  it('recognises a leading priority marker and keeps it out of the label', () => {
    const parts = parseThought('urgent: call the plumber', TODAY);
    expect(parts.priority).toBe('urgent');
    expect(parts.intent.toLowerCase()).toBe('call the plumber');
    expect(parts.hadFacets).toBe(true);
  });

  it('recognises a trailing priority marker', () => {
    const parts = parseThought('call the dentist ASAP', TODAY);
    expect(parts.priority).toBe('urgent');
    expect(parts.intent.toLowerCase()).toBe('call the dentist');
  });

  it('recognises state modifiers', () => {
    expect(parseThought('send the invoice - waiting', TODAY).priority).toBe('waiting');
    expect(parseThought('contact John blocked', TODAY).priority).toBe('blocked');
  });

  it('leaves an embedded adjective in the label (only edge markers strip)', () => {
    const parts = parseThought('write an important email', TODAY);
    expect(parts.priority).toBeNull();
    expect(parts.intent.toLowerCase()).toBe('write an important email');
  });

  it('combines an obligation filler with a priority/trailing facet', () => {
    const parts = parseThought('I need to call the dentist urgently', TODAY);
    expect(parts.priority).toBe('urgent');
    expect(parts.intent.toLowerCase()).toBe('call the dentist');
  });

// ── V1.1: facets are independent of one another ──────────────────────
  it('leaves a facet-less thought untouched except for the cleaned action', () => {
    const parts = parseThought('Belgium needs attention', TODAY);
    expect(parts.intent).toBe('Belgium needs attention');
    expect(parts.date).toBeNull();
    expect(parts.time).toBeNull();
    expect(parts.locationHint).toBeNull();
    expect(parts.priority).toBeNull();
    expect(parts.hadFacets).toBe(false);
  });

  it('extracts the date facet from the same thought without hiding the entity', () => {
    const parts = parseThought('Belgium needs attention on Monday', TODAY);
    expect(parts.date).toBe('2026-09-07');
    expect(parts.intent).toBe('Belgium needs attention');
  });

  it('strips the obligation filler from an entity-oriented thought', () => {
    const parts = parseThought('Need to reprice the spouting for Gladstone', TODAY);
    expect(parts.intent.toLowerCase()).toBe('reprice the spouting for gladstone');
    expect(parts.date).toBeNull();
    expect(parts.hadFacets).toBe(true); // obligation filler was removed
  });

  // ── V1.1: road phrase mid-sentence (Meetings pattern) ───────────────
  it('captures only the short road phrase when the road is mid-sentence', () => {
    const parts = parseThought('Meeting with Tim at Belgium Rd tomorrow at 2pm', TODAY);
    expect(parts.locationHint).toBe('Belgium Rd');
    expect(parts.date).toBe('2026-09-05');
    expect(parts.time?.hour).toBe(14);
    expect(parts.intent).toBe('Meeting with Tim');
  });

  it('handles "14 Belgium Road" and a two-name road equally', () => {
    expect(parseThought('14 Belgium Road', TODAY).locationHint).toBe('14 Belgium Road');
    expect(parseThought('Valley View Avenue next week', TODAY).locationHint).toBe('Valley View Avenue');
  });

  // ── Subject-position locations stay in the title ───────────────────────
  it('keeps a subject-position road phrase in the title and still surfaces it as location', () => {
    // "Regent Street needs attention Monday at 10am" — the street is both the
    // subject of the action and a place. It must not vanish from the label.
    const parts = parseThought('Regent Street needs attention Monday at 10am', TODAY);
    expect(parts.locationHint).toBe('Regent Street');
    expect(parts.intent.toLowerCase()).toContain('regent street');
    expect(parts.intent.toLowerCase()).toContain('needs attention');
    expect(parts.date).toBe('2026-09-07');
    expect(parts.time?.hour).toBe(10);
    expect(parts.time?.minute).toBe(0);
  });

  it('still strips a leading place when a purpose "to …" clause follows', () => {
    const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
    expect(parts.locationHint).toBe('Belgium Rd');
    expect(parts.intent).toBe('measure Rainwater Head');
  });

  it('still strips a mid-sentence place adjunct after "at"', () => {
    const parts = parseThought('Meeting with Tim at Belgium Rd tomorrow at 2pm', TODAY);
    expect(parts.locationHint).toBe('Belgium Rd');
    expect(parts.intent).toBe('Meeting with Tim');
  });
});
