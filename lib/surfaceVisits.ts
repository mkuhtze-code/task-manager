/**
 * UX-3 — quiet surface visit counts (localStorage).
 * Used only to promote a compact nav rail for Pro users who actually
 * open Jobs / Travel / Meetings. Not analytics product; not sent off-device.
 */

export type VisitSurface = 'today' | 'jobs' | 'meetings' | 'travel';

const KEY = 'dokkit.ux.surface_visits_v1';

export type SurfaceVisitMap = Partial<Record<VisitSurface, number>>;

export function readSurfaceVisits(): SurfaceVisitMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SurfaceVisitMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function recordSurfaceVisit(surface: VisitSurface): void {
  if (typeof window === 'undefined') return;
  try {
    const map = readSurfaceVisits();
    map[surface] = (map[surface] ?? 0) + 1;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Pro rail when the user has explored beyond Today enough times. */
export function shouldPreferSurfaceRail(visits: SurfaceVisitMap): boolean {
  const depth =
    (visits.jobs ?? 0) + (visits.meetings ?? 0) + (visits.travel ?? 0);
  return depth >= 4;
}

