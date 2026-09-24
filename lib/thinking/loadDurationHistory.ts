/**
 * Shared duration history for ambient learning.
 * Same evidence Today/Jobs use — Travel and Meetings should train against it too.
 */

import {
  buildClusters,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';

/** Map a tasks row into a HistoricalTask for clusters / closeCompletionLoop. */
export function mapHistoryRow(r: {
  text?: string | null;
  actual_mins?: number | null;
  location_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  job_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  estimate_mins?: number | null;
  logged_mins?: number | null;
  due_today?: boolean | null;
  surface_date?: string | null;
  source?: string | null;
  intended_time?: string | null;
}): HistoricalTask | null {
  if (r.actual_mins == null || !Number.isFinite(Number(r.actual_mins))) return null;
  if (!r.text || !String(r.text).trim()) return null;
  return {
    text: String(r.text),
    actual_mins: Number(r.actual_mins),
    location_text: r.location_text ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    job_id: r.job_id ?? null,
    created_at: r.created_at ?? null,
    completed_at: r.completed_at ?? null,
    estimate_mins: r.estimate_mins ?? null,
    logged_mins: r.logged_mins ?? null,
    due_today: r.due_today ?? null,
    surface_date: r.surface_date ?? null,
    source: r.source ?? null,
    intended_time: r.intended_time ?? null,
  };
}

/**
 * Load recent completed tasks with trustworthy actuals for this user.
 * Best-effort: returns [] on error (never blocks the UI).
 */
export async function fetchDurationHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  limit: number = 500
): Promise<HistoricalTask[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'text, actual_mins, location_text, lat, lng, job_id, created_at, completed_at, estimate_mins, logged_mins, due_today, surface_date, source, intended_time'
      )
      .eq('user_id', userId)
      .eq('status', 'done')
      .neq('source', 'starter')
      .not('actual_mins', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return (data as any[])
      .map(mapHistoryRow)
      .filter((h: HistoricalTask | null): h is HistoricalTask => h != null);
  } catch {
    return [];
  }
}

/** Convenience: history + clusters for completion paths. */
export async function fetchDurationMemory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  limit?: number
): Promise<{ history: HistoricalTask[]; clusters: TaskCluster[] }> {
  const history = await fetchDurationHistory(supabase, userId, limit);
  return { history, clusters: buildClusters(history) };
}
