/**
 * S4 / WS-E — Prediction lifecycle.
 *
 * States:
 *   open → resolved_clean | resolved_dirty | expired | superseded
 *
 * Rules:
 * - Resolve only by taskId (never text-only when identity is ambiguous).
 * - Expire open predictions after PREDICTION_OPEN_HORIZON_DAYS.
 * - Expired / superseded never train duration.
 * - Estimate-only abandonment is observability, not a duration signal.
 *
 * Pure helpers are deterministic. DB apply functions stay in evidence layer.
 */

export const PREDICTION_OPEN_HORIZON_DAYS = 14;

export type PredictionLifecycleStatus =
  | 'open'
  | 'resolved_clean'
  | 'resolved_dirty'
  | 'expired'
  | 'superseded';

export type LifecycleOutcomeKind =
  | 'done'
  | 'partial'
  | 'carry'
  | 'skip'
  | 'interrupted'
  | 'resume'
  | 'edited'
  | null
  | undefined;

export type OpenPredictionRow = {
  id?: string | null;
  task_id?: string | null;
  task_text?: string | null;
  logged_at?: string | null;
  created_at?: string | null;
  actual_mins?: number | null;
  completed_at?: string | null;
  outcome_kind?: LifecycleOutcomeKind;
  lifecycle_status?: PredictionLifecycleStatus | null;
};

export type ResolvePolicy = {
  taskIdOnly: boolean;
};

export const DEFAULT_RESOLVE_POLICY: ResolvePolicy = {
  taskIdOnly: true,
};

export function isCleanOutcome(kind: LifecycleOutcomeKind): boolean {
  return kind === 'done';
}

export function isDirtyOutcome(kind: LifecycleOutcomeKind): boolean {
  return (
    kind === 'partial' ||
    kind === 'carry' ||
    kind === 'skip' ||
    kind === 'interrupted' ||
    kind === 'edited'
  );
}

export function statusAfterOutcome(
  kind: LifecycleOutcomeKind
): PredictionLifecycleStatus {
  if (isCleanOutcome(kind)) return 'resolved_clean';
  if (isDirtyOutcome(kind)) return 'resolved_dirty';
  return 'resolved_dirty';
}

export function mayTrainDurationFromLifecycle(
  status: PredictionLifecycleStatus
): boolean {
  return status === 'resolved_clean';
}

function parseTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function isOpenRow(row: OpenPredictionRow): boolean {
  if (
    row.lifecycle_status === 'expired' ||
    row.lifecycle_status === 'superseded'
  ) {
    return false;
  }
  if (
    row.lifecycle_status === 'resolved_clean' ||
    row.lifecycle_status === 'resolved_dirty'
  ) {
    return false;
  }
  return row.actual_mins == null && !row.completed_at;
}

export function shouldExpireOpen(
  row: OpenPredictionRow,
  asOf: string | Date,
  horizonDays: number = PREDICTION_OPEN_HORIZON_DAYS
): boolean {
  if (!isOpenRow(row)) return false;
  const end =
    typeof asOf === 'string' ? parseTime(asOf) : (asOf as Date).getTime();
  if (!end) return false;
  const logged = parseTime(row.logged_at ?? row.created_at);
  if (!logged) return false;
  const ageMs = end - logged;
  return ageMs >= horizonDays * 24 * 60 * 60 * 1000;
}

export function expireOpenPredictions(
  rows: OpenPredictionRow[],
  asOf: string | Date,
  horizonDays: number = PREDICTION_OPEN_HORIZON_DAYS
): Array<OpenPredictionRow & { lifecycle_status: 'expired' }> {
  return rows
    .filter((r) => shouldExpireOpen(r, asOf, horizonDays))
    .map((r) => ({
      ...r,
      lifecycle_status: 'expired' as const,
      completed_at: typeof asOf === 'string' ? asOf : asOf.toISOString(),
      outcome_kind: null,
    }));
}

export function selectOpenPredictionForTaskId(
  rows: OpenPredictionRow[],
  taskId: string | null | undefined
): OpenPredictionRow | null {
  const id = (taskId ?? '').trim();
  if (!id) return null;
  const opens = rows
    .filter((r) => isOpenRow(r) && (r.task_id ?? '').trim() === id)
    .sort(
      (a, b) =>
        parseTime(b.logged_at ?? b.created_at) -
        parseTime(a.logged_at ?? a.created_at)
    );
  return opens[0] ?? null;
}

export function assertResolveIdentity(
  params: { taskId?: string | null; taskText?: string | null },
  policy: ResolvePolicy = DEFAULT_RESOLVE_POLICY
): { ok: true; taskId: string } | { ok: false; reason: string } {
  const taskId = (params.taskId ?? '').trim();
  if (taskId) return { ok: true, taskId };
  if (policy.taskIdOnly) {
    return {
      ok: false,
      reason: 'taskId required — text is not prediction identity (S4)',
    };
  }
  const text = (params.taskText ?? '').trim();
  if (text) {
    return {
      ok: false,
      reason: 'text-only resolve disabled by default; enable only in legacy mode',
    };
  }
  return { ok: false, reason: 'no taskId or taskText' };
}

export function supersedeOpenForTask(
  rows: OpenPredictionRow[],
  taskId: string,
  asOf: string | Date
): Array<OpenPredictionRow & { lifecycle_status: 'superseded' }> {
  const id = taskId.trim();
  if (!id) return [];
  const at = typeof asOf === 'string' ? asOf : asOf.toISOString();
  return rows
    .filter((r) => isOpenRow(r) && (r.task_id ?? '').trim() === id)
    .map((r) => ({
      ...r,
      lifecycle_status: 'superseded' as const,
      completed_at: at,
    }));
}

export function estimateOnlyRate(params: {
  totalLogged: number;
  resolvedCount: number;
}): number | null {
  if (params.totalLogged < 1) return null;
  const unresolved = Math.max(0, params.totalLogged - params.resolvedCount);
  return unresolved / params.totalLogged;
}
