import { describe, it, expect } from 'vitest';
import { extractFlightSchedule, interpretTravelPaste } from '../travelDocuments';

describe('interpretTravelPaste', () => {
  it('reads a flight number and PNR', () => {
    const r = interpretTravelPaste(
      'Air New Zealand NZ512 AKL to WLG departs 07:00 Monday. Booking reference ABC12D'
    );
    expect(r.doc_type).toBe('flight');
    expect(r.reference_code).toBe('ABC12D');
    expect(r.title.toLowerCase()).toMatch(/flight|nz512|air new zealand/);
    expect(r.carrier?.toLowerCase()).toContain('new zealand');
  });

  it('does not treat a landing-only clock as a departure time', () => {
    const schedule = extractFlightSchedule('Flight NZ512 AKL to WLG lands 13:00');
    expect(schedule.arriveTime).toBe('13:00');
    expect(schedule.departTime).toBeNull();
  });

  it('keeps the explicit departure clock when both departure and arrival are present', () => {
    const schedule = extractFlightSchedule('Flight NZ512 departs 09:00 and lands 13:00');
    expect(schedule.departTime).toBe('09:00');
    expect(schedule.arriveTime).toBe('13:00');
  });

  it('reads a hotel booking', () => {
    const r = interpretTravelPaste(
      'Your hotel reservation confirmation number: HT98765 at the QT Wellington'
    );
    expect(r.doc_type).toBe('booking');
    expect(r.reference_code).toBe('HT98765');
  });
});
