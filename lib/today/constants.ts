/**
 * Explicit column list for Today's task reads — everything the Task type
 * and its consumers (cards, detail sheet, drag reorder, sorting) actually
 * use. Keeps polylines and coordinates while skipping bookkeeping columns
 * (notification flags, timestamps) Today never reads.
 */
export const TASK_COLUMNS =
  'id, text, status, source, estimate_mins, logged_mins, started_at, due_today, order_index, created_at, surface_date, intended_time, location_text, lat, lng, drive_mins_to_next, route_polyline, info, job_id, original_input';

/**
 * sessionStorage flag: the passive "landed on Today" surface event is the
 * same exposure for every mount in one browser session, so it is recorded
 * at most once per session. Deliberate navigation always records.
 */
export const PASSIVE_TODAY_KEY = 'dokkit-passive-today-recorded';
