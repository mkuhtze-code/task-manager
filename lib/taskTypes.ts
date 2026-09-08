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
  // Resolved clock time as 'HH:MM' (e.g. "10:00"), parsed from a unified
  // thought at capture time. Purely additive context — there is no
  // scheduled-time behaviour tied to it in V1; it records the intended time
  // of day so the facet isn't lost. Null when no time was captured.
  intended_time: string | null;
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
  // Freeform information the person would write underneath this task on
  // paper. Plain multiline text; never auto-interpreted into subtasks,
  // reminders, or any other structure.
  info: string;
  // Optional Job this task belongs to. Purely additive context — a Job
  // never overrides this task's own scheduling, estimate, location,
  // status or ordering. Null means the task isn't part of a Job.
  job_id: string | null;
  // The user's raw input verbatim, as typed at capture time. Keeps the
  // original thought even when the stored `text` is the trimmed action.
  // Null for tasks not captured through the unified thought flow.
  original_input: string | null;
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
  start_time: string | null;
  source: string;
};

export type SortMode = 'capacity_first' | 'due_today_first' | 'manual' | 'oldest_first' | 'newest_first' | 'geo_aware';

// Which surface is rendering the Task. Purely contextual — the underlying
// Task model and behaviour never change, only the presentation language.
// 'today' renders scheduling as "Reminder"; 'job' renders the same control
// as "When".
export type TaskContext = 'today' | 'job';

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
// Records the id of the last user for whom /api/account/initialize
// completed successfully on this browser, so returning users skip it.
export const INITIALIZED_FOR_KEY = 'dokkit-initialized-for';
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
