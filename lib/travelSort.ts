export type SortableActivity = {
  id: string;
  text: string;
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
  estimate_mins: number;
  drive_mins_to_next: number;
  order_index: number;
  lat: number | null;
  lng: number | null;
};

export type SortMode = 'what_fits' | 'close_to_accom' | 'nearby_me' | 'manual';

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Sorts flexible items by the chosen mode, leaves fixed items exactly
// where they already sit (by order_index) — this is the "honest v1":
// no auto-slotting of flexible items into gaps around fixed anchors,
// just reordering the flexible ones among themselves.
export function sortActivities(
  activities: SortableActivity[],
  mode: SortMode,
  referencePoint: { lat: number; lng: number } | null
): SortableActivity[] {
  const fixed = activities.filter((a) => a.time_type === 'fixed');
  const flexible = activities.filter((a) => a.time_type === 'flexible');

  let sortedFlexible = [...flexible];

  if (mode === 'manual') {
    sortedFlexible.sort((a, b) => a.order_index - b.order_index);
  } else if ((mode === 'close_to_accom' || mode === 'nearby_me') && referencePoint) {
    sortedFlexible.sort((a, b) => {
      if (a.lat == null || a.lng == null) return 1;
      if (b.lat == null || b.lng == null) return -1;
      const distA = haversineMeters(referencePoint, { lat: a.lat, lng: a.lng });
      const distB = haversineMeters(referencePoint, { lat: b.lat, lng: b.lng });
      return distA - distB;
    });
  } else if (mode === 'what_fits') {
    // Same shape as Dokkit's capacity_first: shorter/cheaper items surface
    // first so the day fills predictably rather than front-loading the
    // longest activity and pushing everything else into overflow.
    sortedFlexible.sort((a, b) => (a.estimate_mins + a.drive_mins_to_next) - (b.estimate_mins + b.drive_mins_to_next));
  } else {
    sortedFlexible.sort((a, b) => a.order_index - b.order_index);
  }

  // Fixed items stay in their original relative position among
  // themselves (chronological by time), flexible items are woven back
  // in at the same relative slots they occupied before sorting — this
  // keeps a fixed dinner reservation from jumping around the list while
  // still letting flexible items reorder around it.
  const fixedSorted = [...fixed].sort((a, b) => (a.fixed_time || '').localeCompare(b.fixed_time || ''));
  const original = [...activities].sort((a, b) => a.order_index - b.order_index);

  const result: SortableActivity[] = [];
  let flexPtr = 0;
  let fixedPtr = 0;
  for (const orig of original) {
    if (orig.time_type === 'fixed') {
      result.push(fixedSorted[fixedPtr]);
      fixedPtr++;
    } else {
      result.push(sortedFlexible[flexPtr]);
      flexPtr++;
    }
  }
  return result;
}

// A fixed item conflicts if the running total of everything scheduled
// before it (in list order) would still be in progress when its fixed
// time arrives. dayStartMinutes anchors the walk-through to the day's
// actual effective start (arrival time, if set).
export function findFixedTimeConflicts(
  orderedActivities: SortableActivity[],
  dayStartMinutes: number
): Record<string, boolean> {
  const conflicts: Record<string, boolean> = {};
  let runningMinutes = dayStartMinutes;

  for (const a of orderedActivities) {
    if (a.time_type === 'fixed' && a.fixed_time) {
      const [h, m] = a.fixed_time.split(':').map((n) => parseInt(n, 10));
      const fixedMinutes = h * 60 + m;
      if (runningMinutes > fixedMinutes) {
        conflicts[a.id] = true;
      }
      runningMinutes = fixedMinutes + a.estimate_mins + a.drive_mins_to_next;
    } else {
      runningMinutes += a.estimate_mins + a.drive_mins_to_next;
    }
  }
  return conflicts;
}
