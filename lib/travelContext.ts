/** Shared Travel context for Today / Meetings / Jobs — local dates + active trip lookup. */

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD from an ISO timestamp (uses local calendar day). */
export function dateStrFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localDateStr(d);
}

export function daysBetweenInclusive(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const a = new Date(sy, sm - 1, sd).getTime();
  const b = new Date(ey, em - 1, ed).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function dayIndexOnTrip(start: string, onDate: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [oy, om, od] = onDate.split('-').map(Number);
  const a = new Date(sy, sm - 1, sd).getTime();
  const b = new Date(oy, om - 1, od).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export type ActiveTripSummary = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

export type TripDaySummary = {
  id: string;
  date: string;
  stopCount: number;
  stopLabels: string[];
};
