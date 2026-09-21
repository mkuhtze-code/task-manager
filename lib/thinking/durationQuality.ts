/**
 * Duration quality — when is actual_mins trustworthy enough to train capacity?
 *
 * Completing a task without a timer often writes 0 (or near-zero) minutes.
 * That is not a measurement of work; treating it as one poisons clusters.
 *
 * When duration is unreliable, fall back to other relationships the task has:
 * job attachment, same-day vs carry, anchors (due / intended time), decomposition
 * (subtasks), and any positive user estimate. Deterministic. No AI.
 */

/** Minimum minutes that count as a real observation (not a zero-tap Done). */
export const MIN_RELIABLE_ACTUAL_MINS = 1;

/** Soft unit used when subtasks exist but no timed samples. */
const SUBTASK_SOFT_MINS = 15;

/** Baseline soft cost when structure implies substance but time was never logged. */
const STRUCTURE_BASE_MINS = 25;

export function isReliableActualMins(mins: number | null | undefined): boolean {
  return typeof mins === 'number' && Number.isFinite(mins) && mins >= MIN_RELIABLE_ACTUAL_MINS;
}

/** Filter a list of actuals down to ones safe for duration memory / clusters. */
export function reliableActuals(actuals: readonly number[]): number[] {
  return actuals.filter((m) => isReliableActualMins(m));
}

export type LifecycleHints = {
  /** Positive user-typed or prior estimate, if any. */
  estimateMins?: number | null;
  /** Timer / logged time if any (may still be 0). */
  loggedMins?: number | null;
  jobId?: string | null;
  dueToday?: boolean | null;
  intendedTime?: string | null;
  /** Created vs completed calendar separation implies carry in the past. */
  createdAt?: string | null;
  completedAt?: string | null;
  surfaceDate?: string | null;
  subtaskCount?: number | null;
  /** Fraction of similar tasks that finished same day (0–1), if known. */
  sameDayRate?: number | null;
  /** Fraction of similar tasks attached to a job (0–1), if known. */
  jobRate?: number | null;
};

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Infer a soft duration when timed history is missing or dominated by zeros.
 * Returns null only when there is truly no signal — caller should then use
 * the global soft floor from calibration / onboarding.
 */
export function lifecycleSoftMins(hints: LifecycleHints): number | null {
  const parts: number[] = [];

  // 1. User estimate — strongest explicit prior when > 0.
  if (typeof hints.estimateMins === 'number' && hints.estimateMins > 0) {
    parts.push(hints.estimateMins);
  }

  // 2. Logged time that is reliable (session was timed).
  if (isReliableActualMins(hints.loggedMins ?? null)) {
    parts.push(hints.loggedMins as number);
  }

  // 3. Decomposition — more subtasks ⇒ more substance.
  const subs = hints.subtaskCount ?? 0;
  if (subs > 0) {
    parts.push(Math.min(120, STRUCTURE_BASE_MINS + subs * SUBTASK_SOFT_MINS));
  }

  // 4. Job-attached work is rarely zero-effort.
  if (hints.jobId) {
    parts.push(STRUCTURE_BASE_MINS + 10);
  } else if (hints.jobRate != null && hints.jobRate >= 0.5) {
    parts.push(STRUCTURE_BASE_MINS);
  }

  // 5. Anchors (due today / intended clock) imply protected blocks.
  if (hints.dueToday || (hints.intendedTime && hints.intendedTime.length > 0)) {
    parts.push(STRUCTURE_BASE_MINS + 5);
  }

  // 6. Carry pattern on this instance: survived past creation day.
  if (
    hints.createdAt &&
    hints.completedAt &&
    !sameCalendarDay(hints.createdAt, hints.completedAt)
  ) {
    // Carried work still had enough weight to stay alive — not a 0-minute blip.
    parts.push(STRUCTURE_BASE_MINS);
  }

  // 7. Cluster same-day rate: low same-day ⇒ tends to be larger / stickier work.
  if (hints.sameDayRate != null && hints.sameDayRate < 0.4) {
    parts.push(STRUCTURE_BASE_MINS + 15);
  } else if (hints.sameDayRate != null && hints.sameDayRate >= 0.7) {
    // Quick same-day clears — still not zero if other structure exists.
    parts.push(Math.max(15, STRUCTURE_BASE_MINS - 5));
  }

  if (parts.length === 0) return null;

  // Median of collected signals — robust to one loud prior.
  const sorted = [...parts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];

  return Math.min(180, Math.max(10, median));
}

/**
 * Resolve what to store / train on at completion time.
 * - Reliable measured time → use it
 * - Else lifecycle soft → use it (marked as inferred by caller if needed)
 * - Else null → do not write actual_mins into learning history
 */
export function resolveActualForLearning(params: {
  measuredMins: number;
  hints: LifecycleHints;
}): { actualMins: number | null; source: 'measured' | 'lifecycle' | 'none' } {
  if (isReliableActualMins(params.measuredMins)) {
    return { actualMins: Math.round(params.measuredMins), source: 'measured' };
  }
  const soft = lifecycleSoftMins(params.hints);
  if (soft != null) {
    return { actualMins: soft, source: 'lifecycle' };
  }
  return { actualMins: null, source: 'none' };
}
