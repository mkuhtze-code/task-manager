import { describe, it, expect } from 'vitest';
import {
  distanceMeters,
  areSamePlace,
  DEFAULT_SAME_PLACE_THRESHOLD_M,
} from '../relationships/spatial';

describe('distanceMeters', () => {
  it('returns 0 for identical points', () => {
    expect(distanceMeters({ lat: 51.5, lng: -1.7 }, { lat: 51.5, lng: -1.7 })).toBe(0);
  });

  it('computes known distance between London and Birmingham', () => {
    // London (51.5074, -0.1278) to Birmingham (52.4862, -1.8904) ≈ 163 km
    const d = distanceMeters(
      { lat: 51.5074, lng: -0.1278 },
      { lat: 52.4862, lng: -1.8904 }
    );
    expect(d).toBeGreaterThan(160_000);
    expect(d).toBeLessThan(170_000);
  });

  it('computes short distance accurately (1 degree latitude ≈ 111 km)', () => {
    const d = distanceMeters(
      { lat: 52.0, lng: -1.0 },
      { lat: 52.001, lng: -1.0 } // 0.001 degree lat ≈ 111m
    );
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it('handles antipodal points', () => {
    const d = distanceMeters(
      { lat: 0, lng: 0 },
      { lat: 0, lng: 180 }
    );
    // Half circumference at equator ≈ 20,015 km
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_100_000);
  });

  it('handles points across the date line', () => {
    const d = distanceMeters(
      { lat: 51.5, lng: 179.9 },
      { lat: 51.5, lng: -179.9 }
    );
    // Should be small — these are 0.2 degrees apart across the date line
    expect(d).toBeLessThan(15_000);
  });

  it('handles south hemisphere', () => {
    const d = distanceMeters(
      { lat: -33.8688, lng: 151.2093 }, // Sydney
      { lat: -37.8136, lng: 144.9631 }  // Melbourne
    );
    // Sydney to Melbourne ≈ 714 km
    expect(d).toBeGreaterThan(700_000);
    expect(d).toBeLessThan(730_000);
  });

  it('returns NaN for non-finite coordinates', () => {
    expect(distanceMeters({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toBeNaN();
    expect(distanceMeters({ lat: 0, lng: Infinity }, { lat: 0, lng: 0 })).toBeNaN();
  });

  it('handles zero coordinates', () => {
    // (0, 0) to (0, 0) = 0
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
});

describe('areSamePlace', () => {
  const solihull = { lat: 52.4128, lng: -1.7745 };

  it('returns true for identical coordinates', () => {
    expect(areSamePlace(solihull, solihull)).toBe(true);
  });

  it('returns true within default 50m threshold', () => {
    // Move ~20m north
    expect(areSamePlace(solihull, { lat: 52.4130, lng: -1.7745 })).toBe(true);
  });

  it('returns false beyond default 50m threshold', () => {
    // Move ~200m north
    expect(areSamePlace(solihull, { lat: 52.4146, lng: -1.7745 })).toBe(false);
  });

  it('respects custom threshold', () => {
    const point = { lat: 52.4135, lng: -1.7745 }; // ~80m north
    expect(areSamePlace(solihull, point, 100)).toBe(true);
    expect(areSamePlace(solihull, point, 50)).toBe(false);
  });

  it('returns false when either point has null coordinates', () => {
    expect(areSamePlace({ lat: null, lng: null }, solihull)).toBe(false);
    expect(areSamePlace(solihull, { lat: null, lng: null })).toBe(false);
    expect(areSamePlace({ lat: null, lng: -1.77 }, solihull)).toBe(false);
    expect(areSamePlace(solihull, { lat: 52.4, lng: null })).toBe(false);
  });

  it('returns false for NaN coordinates', () => {
    expect(areSamePlace({ lat: NaN, lng: -1.77 }, solihull)).toBe(false);
    expect(areSamePlace(solihull, { lat: 52.4, lng: Infinity })).toBe(false);
  });

  it('boundary: just inside threshold', () => {
    // 49m north ≈ 0.00044 degrees latitude (1 deg ≈ 111,320m)
    const pointInside = { lat: solihull.lat + 0.00044, lng: solihull.lng };
    const d = distanceMeters(solihull, pointInside);
    expect(d).toBeLessThan(50);
    expect(areSamePlace(solihull, pointInside, 50)).toBe(true);
  });

  it('boundary: just outside threshold', () => {
    // 55m north ≈ 0.000495 degrees latitude
    const pointOutside = { lat: solihull.lat + 0.000495, lng: solihull.lng };
    const d = distanceMeters(solihull, pointOutside);
    expect(d).toBeGreaterThan(50);
    expect(areSamePlace(solihull, pointOutside, 50)).toBe(false);
  });

  it('handles zero threshold', () => {
    expect(areSamePlace(solihull, solihull, 0)).toBe(true);
    // Any non-identical point should fail with 0 threshold
    expect(areSamePlace(solihull, { lat: 52.413, lng: -1.774 }, 0)).toBe(false);
  });

  it('default threshold is 50m', () => {
    expect(DEFAULT_SAME_PLACE_THRESHOLD_M).toBe(50);
  });
});
