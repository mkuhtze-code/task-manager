// lib/todayRoute.ts
//
// Pure functions powering Today's geography-aware sort mode. No Supabase,
// no fetch — same "start how you mean to finish" discipline as
// lib/travelSort.ts, so this stays portable if the app ever moves off
// the web.

export type Coords = { lat: number; lng: number };

export type BaseResult = {
  coords: Coords | null;
  label: 'work' | 'home' | null;
};

// Office during work hours on a work day, home otherwise. Falls back
// gracefully if only one of the two is set, and returns no base at all
// if neither is configured — mirrors Travel's base_lat == null handling.
export function determineBase(
  now: Date,
  workStart: string,
  workEnd: string,
  workDays: number[],
  home: Coords | null,
  work: Coords | null
): BaseResult {
  const dow = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = workStart.split(':').map((n) => parseInt(n, 10));
  const [eh, em] = workEnd.split(':').map((n) => parseInt(n, 10));
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const isWorkTime = workDays.includes(dow) && nowMins >= startMins && nowMins < endMins;

  if (isWorkTime && work) return { coords: work, label: 'work' };
  if (isWorkTime && !work && home) return { coords: home, label: 'home' };
  if (!isWorkTime && home) return { coords: home, label: 'home' };
  if (!isWorkTime && !home && work) return { coords: work, label: 'work' };
  return { coords: null, label: null };
}

function haversineMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type LocatedTask = { id: string; lat: number; lng: number };

// Greedy nearest-neighbor from the base — not a true TSP solve, but a
// day realistically has a handful of located tasks, not hundreds, so the
// gap between "optimal" and "nearest-neighbor" is negligible while the
// implementation cost gap is not. Same honest-v1 approach as Travel's
// close_to_accom sort mode.
export function nearestNeighborOrder(base: Coords, tasks: LocatedTask[]): string[] {
  const remaining = [...tasks];
  const order: string[] = [];
  let current = base;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((t, idx) => {
      const d = haversineMeters(current, { lat: t.lat, lng: t.lng });
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    order.push(next.id);
    current = { lat: next.lat, lng: next.lng };
  }

  return order;
}

// Weaves a geo-ordered sequence of located task ids back into the
// original relative structure — non-located tasks keep the exact
// structural slot they held before, while located tasks fill their
// slots in nearest-neighbor order instead of original order_index
// order. Same "weave by original slot" technique already used in
// lib/travelSort.ts for fixed/flexible items, applied here to
// located/non-located instead.
export function weaveGeoOrder<T extends { id: string; lat: number | null; lng: number | null }>(
  originalOrder: T[],
  geoOrderedIds: string[]
): T[] {
  const byId: Record<string, T> = {};
  originalOrder.forEach((t) => (byId[t.id] = t));

  let geoPtr = 0;
  return originalOrder.map((t) => {
    const isLocated = t.lat != null && t.lng != null;
    if (isLocated) {
      const nextId = geoOrderedIds[geoPtr];
      geoPtr++;
      return byId[nextId];
    }
    return t;
  });
}
