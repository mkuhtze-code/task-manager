export type Task = {
  id: string;
  text: string;
  status: 'pending' | 'active' | 'done';
  source: 'planned' | 'came_up';
  estimate_mins: number;
  logged_mins: number;
  started_at: string | null;
  due_today: boolean;
  order_index: number;
  created_at: string;
  // Date (YYYY-MM-DD) this task should first become visible. Null/past
  // means "visible now" — the existing, unchanged behavior. A future date
  // means the task is a passive reminder: fully hidden from the list,
  // capacity math, and day rail until that date arrives, at which point
  // it just appears like any other task/list item — no notification,
  // no "overdue" state if a day is missed.
  surface_date: string | null;
  // Optional location — mirrors activities in Travel. drive_mins_to_next
  // and route_polyline are only meaningful in geo_aware sort mode; each
  // located task carries the leg to whichever located task comes next in
  // the geographic route (the last located task carries the return leg
  // back to the start point).
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  drive_mins_to_next: number;
  route_polyline: string | null;
};

export type Subtask = {
  id: string;
  task_id: string;
  text: string;
  mins: number;
  done: boolean;
};

export type Meeting = {
  id: string;
  text: string;
  duration_mins: number;
};

export type SortMode = 'capacity_first' | 'due_today_first' | 'manual' | 'oldest_first' | 'newest_first' | 'geo_aware';

export type DragState = {
  id: string;
  originalIndex: number;
  currentIndex: number;
  startY: number;
  offsetY: number;
  rowHeight: number;
  orderSnapshot: string[];
};

export const HAS_SIGNED_IN_KEY = 'dokkit-has-signed-in';
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];
export const LONG_PRESS_MS = 500;
export const ROW_GAP = 8;

// Same day-label set used on the Preferences page, so onboarding and
// Preferences look and behave identically rather than as two slightly
// different implementations of the same control.
export const DAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
  { label: 'S', value: 0 },
];
