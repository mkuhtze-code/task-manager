import type { Task } from '@/lib/taskTypes';

// Local (not UTC) YYYY-MM-DD, so "Friday" means the user's Friday, not
// whatever day it happens to be in UTC at the time.
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseMins(raw: string): number | null {
  const str = raw.trim().toLowerCase();
  if (str.length === 0) return 0;
  const last = str.charAt(str.length - 1);
  let unit = 'm';
  let numStr = str;
  if (last === 'h' || last === 'm') {
    unit = last;
    numStr = str.slice(0, -1);
  }
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  return unit === 'h' ? Math.round(num * 60) : Math.round(num);
}

export function fmtMins(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Turns a raw minute count back into something parseMins() can read, for
// filling in the capture time field when a suggestion chip is tapped.
export function minsToInput(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

export function fmtClock(timeStr: string): string {
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

export function timeStringToMinutes(t: string): number {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

export function fmtSurfaceDate(dateStr: string): string {
  // Parse as local, not UTC, to avoid off-by-one day display issues.
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function isScheduledForLater(t: Task, todayStr: string): boolean {
  if (!t.surface_date) return false;

  // Supabase's canonical schema stores surface_date as a PostgreSQL `date`,
  // but older/partially migrated data can arrive as a date-time string.
  // Comparing a date-time directly with YYYY-MM-DD makes a task scheduled
  // for today look "later" because `2026-08-24T... > 2026-08-24`.
  // Normalize to the date portion before comparing so today's tasks remain
  // visible regardless of the persisted representation.
  const surfaceDate = String(t.surface_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(surfaceDate)) return false;
  return surfaceDate > todayStr;
}
