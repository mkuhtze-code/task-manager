/**
 * FP-2 — Cold-start structural features (Day 0–2).
 *
 * When personal clean-n is low, prefer structure + calendar over pretending
 * personal expertise. Pure. Deterministic. No network.
 */

export type StructuralFeatures = {
  hasJob: boolean;
  hasPlace: boolean;
  textLength: number;
  subtaskCount: number;
  dueToday: boolean;
  hasIntendedTime: boolean;
  /** User-typed or existing estimate when present. */
  estimateMins: number | null;
  /** Active session / logged minutes when present. */
  loggedMins: number | null;
};

export type StructuralTaskLike = {
  text?: string | null;
  job_id?: string | null;
  location_text?: string | null;
  estimate_mins?: number | null;
  logged_mins?: number | null;
  due_today?: boolean | null;
  intended_time?: string | null;
  subtask_count?: number | null;
};

/** Derive structural features from a task row (or capture draft). */
export function structuralFeaturesFromTask(
  task: StructuralTaskLike | null | undefined
): StructuralFeatures {
  if (!task) {
    return {
      hasJob: false,
      hasPlace: false,
      textLength: 0,
      subtaskCount: 0,
      dueToday: false,
      hasIntendedTime: false,
      estimateMins: null,
      loggedMins: null,
    };
  }
  const text = (task.text ?? '').trim();
  const estimate =
    typeof task.estimate_mins === 'number' && task.estimate_mins > 0
      ? Math.round(task.estimate_mins)
      : null;
  const logged =
    typeof task.logged_mins === 'number' && task.logged_mins > 0
      ? Math.round(task.logged_mins)
      : null;
  const subs =
    typeof task.subtask_count === 'number' && task.subtask_count > 0
      ? task.subtask_count
      : 0;

  return {
    hasJob: Boolean(task.job_id),
    hasPlace: Boolean((task.location_text ?? '').trim()),
    textLength: text.length,
    subtaskCount: subs,
    dueToday: Boolean(task.due_today),
    hasIntendedTime: Boolean((task.intended_time ?? '').trim()),
    estimateMins: estimate,
    loggedMins: logged,
  };
}

/**
 * Soft capacity hint when personal duration evidence is weak.
 * Never claims personal authority — reasons stay structural.
 */
export function coldStartCapacityHint(
  features: StructuralFeatures,
  opts?: { softFloorMins?: number }
): { mins: number; reasons: string[] } {
  const floor = opts?.softFloorMins ?? 30;
  const reasons: string[] = [];
  const parts: number[] = [];

  if (features.estimateMins != null) {
    parts.push(features.estimateMins);
    reasons.push(`typed estimate ${features.estimateMins}m`);
  }
  if (features.loggedMins != null && features.loggedMins > 0) {
    parts.push(Math.max(features.loggedMins, floor));
    reasons.push('logged session time');
  }
  if (features.subtaskCount > 0) {
    const sub = Math.min(120, 15 + features.subtaskCount * 12);
    parts.push(sub);
    reasons.push(`${features.subtaskCount} subtask(s)`);
  }
  if (features.hasJob) {
    parts.push(floor + 10);
    reasons.push('attached to a job');
  } else if (features.hasPlace) {
    parts.push(floor + 5);
    reasons.push('has a place');
  }
  if (features.textLength >= 48) {
    parts.push(floor + 15);
    reasons.push('longer description');
  } else if (features.textLength >= 24) {
    parts.push(floor + 5);
  }

  if (parts.length === 0) {
    reasons.push('default soft floor');
    return { mins: floor, reasons };
  }

  const sorted = [...parts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  const mins = Math.min(180, Math.max(10, med));
  return { mins, reasons };
}

/**
 * True when hierarchical duration should not claim personal expertise.
 */
export function isColdStartDuration(
  duration: {
    level?: string | null;
    distribution?: { sampleSize?: number } | null;
    authority?: string | null;
  } | null
): boolean {
  if (!duration) return true;
  const n = duration.distribution?.sampleSize ?? 0;
  if (duration.level === 'system' || duration.level === 'onboarding') return true;
  if (n < 2) return true;
  if (duration.authority === 'observe' && n < 3) return true;
  return false;
}
