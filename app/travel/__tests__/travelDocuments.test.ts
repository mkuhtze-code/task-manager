import { describe, it, expect } from 'vitest';
import {
  interpretTravelPaste,
  extractFlightSchedule,
  extractClockTime,
  matchTripDayForFlight,
  buildFlightActivityDraft,
} from '../travelDocuments';

describe('interpretTravelPaste', () => {
  it('reads a flight number and PNR', () => {
    const r = interpretTravelPaste(
      'Air New Zealand NZ512 AKL to WLG departs 07:00 Monday. Booking reference ABC12D'
    );
    expect(r.doc_type).toBe('flight');
    expect(r.reference_code).toMatch(/ABC12D|NZ512/);
    expect(r.title.toLowerCase()).toMatch(/flight|nz512|air new zealand/);
    expect(r.carrier?.toLowerCase()).toContain('new zealand');
  });

  it('reads a hotel booking', () => {
    const r = interpretTravelPaste(
      'Your hotel reservation confirmation number: HT98765 at the QT Wellington'
    );
    expect(r.doc_type).toBe('booking');
    expect(r.reference_code).toBe('HT98765');
  });
});

describe('flight schedule → activity', () => {
  it('extracts route and depart time', () => {
    const s = extractFlightSchedule('NZ512 AKL→WLG 07:00 Mon · PNR ABC123');
    expect(s.flightNumber).toBe('NZ512');
    expect(s.origin).toBe('AKL');
    expect(s.destination).toBe('WLG');
    expect(s.departTime).toBe('07:00');
  });

  it('extractClockTime handles am/pm', () => {
    expect(extractClockTime('departs 7:30 am')).toBe('07:30');
    expect(extractClockTime('leaves 2:15 pm')).toBe('14:15');
  });

  it('matches weekday to trip day', () => {
    const days = [
      { id: 'd1', date: '2026-10-05' }, // Monday
      { id: 'd2', date: '2026-10-06' }, // Tuesday
    ];
    const s = extractFlightSchedule(
      'Flight NZ512 AKL to WLG departs 07:00 Monday',
      { tripDays: days }
    );
    expect(s.dateYmd).toBe('2026-10-05');
    const day = matchTripDayForFlight(days, s.dateYmd);
    expect(day?.id).toBe('d1');
  });

  it('buildFlightActivityDraft is fixed when time known', () => {
    const s = extractFlightSchedule('Qantas QF1 SYD→LAX departs 14:30');
    const draft = buildFlightActivityDraft('Flight QF1', s);
    expect(draft.activity_type).toBe('flight');
    expect(draft.time_type).toBe('fixed');
    expect(draft.fixed_time).toBe('14:30');
    expect(draft.location_text).toMatch(/SYD/);
  });

  it('falls back to first trip day when no date', () => {
    const days = [
      { id: 'd1', date: '2026-10-08' },
      { id: 'd2', date: '2026-10-09' },
    ];
    const day = matchTripDayForFlight(days, null);
    expect(day?.id).toBe('d1');
  });
});
