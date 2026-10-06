import { describe, it, expect } from 'vitest';
import { interpretTravelPaste } from '../travelDocuments';

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
