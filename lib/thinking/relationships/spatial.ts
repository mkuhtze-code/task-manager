// lib/thinking/relationships/spatial.ts
//
// Deterministic spatial relationships between coordinates. Pure functions
// over numeric lat/lng pairs — no geocoding, no text matching, no place
// classification. These primitives answer "are these two points close?"
// not "what is this place."

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two coordinate pairs using the Haversine
 * formula. Returns distance in metres.
 *
 * Returns 0 for identical points. Returns NaN if either point has invalid
 * coordinates (non-finite lat/lng values).
 */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Default same-place threshold: 50 metres. */
export const DEFAULT_SAME_PLACE_THRESHOLD_M = 50;

/**
 * Deterministic same-place relationship based on coordinate proximity.
 *
 * Returns true only when both points have valid (finite) coordinates and
 * the Haversine distance between them is ≤ thresholdMeters.
 *
 * Missing or invalid coordinates always return false — this function
 * never produces a false-positive "same place" from absent data.
 */
export function areSamePlace(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
  thresholdMeters: number = DEFAULT_SAME_PLACE_THRESHOLD_M
): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return false;
  }
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return false;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false;
  return distanceMeters(
    { lat: a.lat, lng: a.lng },
    { lat: b.lat, lng: b.lng }
  ) <= thresholdMeters;
}
