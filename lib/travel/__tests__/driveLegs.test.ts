import { describe, expect, it } from 'vitest';
import { buildGoogleMapsDirectionsUrl, displayDriveEstimate } from '../driveLegs';

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
