import { describe, it, expect } from 'vitest';
import {
  buildStayActivityDraft,
  extractFlightSchedule,
  findMatchingFlightActivity,
  findMatchingStayActivity,
  interpretTravelPaste,
  sortTravelDocumentsForTimeline,
} from '../travelDocuments';

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


describe('travel vault bridges', () => {
  it('builds a stay as a non-task all-day stop with a quiet location link', () => {
    expect(buildStayActivityDraft('QT Wellington', 'Corner of Lambton Quay')).toEqual({
      text: 'Stay · QT Wellington',
      activity_type: 'stop',
      estimate_mins: 0,
      drive_mins_to_next: 0,
      location_text: 'Corner of Lambton Quay',
      time_type: 'flexible',
      fixed_time: null,
      stop_kind: 'stay',
      presence: 'all_day',
      status: 'pending',
    });
  });

  it('does not double-prefix a stay title', () => {
    expect(buildStayActivityDraft('Stay · QT Wellington').text).toBe('Stay · QT Wellington');
  });

  it('reuses the document-linked flight even when another matching flight exists', () => {
    const activities = [
      { id: 'same-flight', text: 'Flight NZ512 · AKL → WLG', activity_type: 'flight', stop_kind: 'other' },
      { id: 'linked-flight', text: 'Flight NZ512', activity_type: 'flight', stop_kind: 'other' },
    ];
    expect(findMatchingFlightActivity(activities, 'linked-flight', 'NZ512', 'Flight NZ512')?.id)
      .toBe('linked-flight');
  });

  it('finds an existing flight across days when the document link is absent', () => {
    const activities = [
      { id: 'stay', text: 'Stay · QT', activity_type: 'stop', stop_kind: 'stay' },
      { id: 'flight', text: 'Air NZ NZ512 · AKL → WLG', activity_type: 'flight', stop_kind: 'other' },
    ];
    expect(findMatchingFlightActivity(activities, null, 'NZ512', 'Flight NZ512')?.id).toBe('flight');
  });

  it('reuses an existing linked stay before title matching', () => {
    const activities = [
      { id: 'stay-a', text: 'Stay · QT Wellington', activity_type: 'stop', stop_kind: 'stay' },
      { id: 'stay-b', text: 'Stay · QT Wellington', activity_type: 'stop', stop_kind: 'stay' },
    ];
    expect(findMatchingStayActivity(activities, 'stay-b', 'Stay · QT Wellington')?.id).toBe('stay-b');
  });

  it('orders evidence by event time, using capture time for undated evidence, without mutating input', () => {
    const docs = [
      { id: 'later', starts_at: '2026-10-19T09:00:00', created_at: '2026-10-10T00:00:00' },
      { id: 'undated', starts_at: null, created_at: '2026-10-12T00:00:00' },
      { id: 'earlier', starts_at: '2026-10-18T10:00:00', created_at: '2026-10-15T00:00:00' },
    ];
    expect(sortTravelDocumentsForTimeline(docs).map((doc) => doc.id)).toEqual([
      'undated',
      'earlier',
      'later',
    ]);
    expect(docs.map((doc) => doc.id)).toEqual(['later', 'undated', 'earlier']);
  });
});
