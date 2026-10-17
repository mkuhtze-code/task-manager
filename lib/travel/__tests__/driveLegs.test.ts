import { describe, expect, it } from 'vitest';
import { buildGoogleMapsDirectionsUrl, displayDriveEstimate } from '../driveLegs';
import { findUnverifiableFixedTimeStops } from '@/lib/travelSort';

describe('Travel T3 drive honesty and Maps handoff', () => {
  it('prefers coordinates for a destination handoff', () => {
    const url = buildGoogleMapsDirectionsUrl({
      lat: -36.8485,
      lng: 174.7633,
      locationText: 'Auckland CBD',
      label: 'Supplier',
    });
    expect(url).toContain('https://www.google.com/maps/dir/?');
    expect(url).toContain('destination=-36.8485%2C174.7633');
    expect(url).toContain('travelmode=driving');
  });

  it('falls back to the location query when coordinates are unavailable', () => {
    const url = buildGoogleMapsDirectionsUrl({
      lat: null,
      lng: null,
      locationText: '14 Queen Street, Auckland',
      label: 'Supplier',
    });
    expect(url).toContain('destination=14+Queen+Street%2C+Auckland');
  });

  it('returns no handoff when there is no location at all', () => {
    expect(buildGoogleMapsDirectionsUrl({ lat: null, lng: null, label: '   ' })).toBeNull();
  });

  it('never presents an unknown or zero estimate as zero minutes', () => {
    expect(displayDriveEstimate(0)).toBe('Drive unknown');
    expect(displayDriveEstimate(null)).toBe('Drive unknown');
    expect(displayDriveEstimate(undefined)).toBe('Drive unknown');
    expect(displayDriveEstimate(24)).toBe('24m');
  });
});

describe('Travel T3 unverifiable fixed-time routes', () => {
  const stop = (id: string, time_type: 'fixed' | 'flexible', drive_mins_to_next: number) => ({
    id, text: id, time_type, fixed_time: time_type === 'fixed' ? '15:00' : null,
    estimate_mins: 30, drive_mins_to_next, order_index: 0, lat: -36.8, lng: 174.7,
  });

  it('flags a fixed-time stop after an unknown inter-stop drive without calling it a definite conflict', () => {
    const result = findUnverifiableFixedTimeStops([
      stop('first', 'flexible', 0),
      stop('appointment', 'fixed', 20),
    ]);
    expect(result.appointment).toBe(true);
  });

  it('flags a first fixed stop when the base-to-first drive is unknown', () => {
    const result = findUnverifiableFixedTimeStops([stop('appointment', 'fixed', 0)], true);
    expect(result.appointment).toBe(true);
  });

  it('does not flag a fixed stop when all preceding drives are known', () => {
    const result = findUnverifiableFixedTimeStops([
      stop('first', 'flexible', 15),
      stop('appointment', 'fixed', 0),
    ]);
    expect(result.appointment).toBeUndefined();
  });
});
