import type { Coords } from '@/lib/todayRoute';

/**
 * One-shot browser geolocation for the route's start point. Resolves to
 * null when the API is unavailable, permission is denied, or the fix
 * doesn't arrive in time — the caller then falls back to Home/Work.
 */
export function getGpsPosition(timeoutMs = 4000): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}
