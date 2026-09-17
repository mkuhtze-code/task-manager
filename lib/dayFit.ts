/**
 * Day fit — honest capacity when estimates are missing, and overflow carry
 * when new anchor work arrives on a full day.
 *
 * Deterministic. No AI. Aligns with: tool conforms to the user.
 *
 * Priority of signals:
 * 1. Typed estimate > 0
 * 2. Learned duration from similar completed work
 * 3. Personal median of all actuals (when cluster has no useful mins)
 * 4. Soft floor so untimed work never pretends to cost zero
 *
 * Urgency when duration is weak:
 * - high same-day completion rate → anchor (protect)
 * - low same-day / high carry-like lag → flexible (safe to surface later)
 * - explicit due_today / intended_time → always anchor
 */

import {
  suggestEstimate,
  effectiveEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';
import { nextWorkSurfaceDate } from '@/lib/realityCapture';

/** Soft floor (minutes) when nothing else is known. Capacity only — not shown as the user estimate. */
export const SOFT_DEFAULT_MINS = 30;

/** Minimum samples before same-day rate influences urgency. */
const MIN_BEHAVIOUR_SAMPLES = 2;

/** same-day rate ≥ this → treat as anchor when duration is weak. */
const ANCHOR_SAME_DAY_RATE = 0.55;

/** same-day rate ≤ this → treat as flexible (safe to carry under pressure). */
const FLEXIBLE_SAME_DAY_RATE = 0.4;

export type UrgencyClass = 'anchor' | 'flexible' | 'neutral';

export type DayFitProfile = {
  /** Minutes this task should consume in capacity math (never 0 for open work). */
  capacityMins: number;
  urgency: UrgencyClass;
  /** True when capacity came from soft default or weak history, not a typed estimate. */
  inferred: boolean;
  /** Optional calm label for UI, e.g. "Often moves forward". */
  behaviourHint: string | null;
};

export type OverflowCarryPlan = {
  /** Task ids to carry to next work day, lowest-urgency first. */
  carryIds: string[];
  /** One calm sentence for the user. */
  message: string;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Personal median of positive actuals, or null if none. */
export function personalMedianActual(history: HistoricalTask[]): number | null {
  const vals = history
    .map((h) => h.actual_mins)
    .filter((m) => typeof m === 'number' && m > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? Math.round((vals[mid - 1] + vals[mid]) / 2) : vals[mid];
}

/**
 * Same-day completion rate among history items similar to `text`.
 * Uses completed_at vs created_at when both exist; otherwise null.
 */
export function similarSameDayRate(
  text: string,
  history: HistoricalTask[],
  threshold = 0.4
): { rate: number; samples: number } | null {
  const input = tokenize(text);
  if (input.size === 0) return null;

  let matched = 0;
  let sameDay = 0;

  for (const h of history) {
    const score = jaccard(input, tokenize(h.text));
    if (score < threshold) continue;
    if (!(h.created_at && h.completed_at)) continue;
    matched++;
    if (sameCalendarDay(h.created_at, h.completed_at)) {
      sameDay++;
    }
  }

  if (matched < MIN_BEHAVIOUR_SAMPLES) return null;
  return { rate: sameDay / matched, samples: matched };
}

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
 * Capacity minutes for an open task. Display estimate stays on the task;
 * this is only for "what fits".
 */
export function capacityMinsForTask(
  task: Pick<Task, 'text' | 'estimate_mins' | 'logged_mins' | 'status' | 'started_at' | 'due_today' | 'intended_time'>,
  history: HistoricalTask[],
  clusters?: TaskCluster[],
  nowMs: number = Date.now()
): { mins: number; inferred: boolean } {
  let logged = task.logged_mins || 0;
  if (task.status === 'active' && task.started_at) {
    logged += (nowMs - new Date(task.started_at).getTime()) / 60000;
  }

  if (task.estimate_mins > 0) {
    const suggestion = suggestEstimate(task.text, history, clusters);
    const eff = effectiveEstimate(task.estimate_mins, suggestion);
    return { mins: Math.max(eff - logged, 0), inferred: false };
  }

  const suggestion = suggestEstimate(task.text, history, clusters);
  if (suggestion && suggestion.suggestedMins > 0) {
    return { mins: Math.max(suggestion.suggestedMins - logged, SOFT_DEFAULT_MINS * 0.5), inferred: true };
  }

  const median = personalMedianActual(history);
  if (median != null && median > 0) {
    return { mins: Math.max(median - logged, SOFT_DEFAULT_MINS * 0.5), inferred: true };
  }

  return { mins: Math.max(SOFT_DEFAULT_MINS - logged, 5), inferred: true };
}

export function urgencyForTask(
  task: Pick<Task, 'text' | 'due_today' | 'intended_time' | 'estimate_mins'>,
  history: HistoricalTask[]
): { urgency: UrgencyClass; behaviourHint: string | null } {
  if (task.due_today || (task.intended_time && task.intended_time.length > 0)) {
    return { urgency: 'anchor', behaviourHint: null };
  }

  const behaviour = similarSameDayRate(task.text, history);
  if (!behaviour) {
    return { urgency: 'neutral', behaviourHint: null };
  }

  if (behaviour.rate >= ANCHOR_SAME_DAY_RATE) {
    return {
      urgency: 'anchor',
      behaviourHint: 'Usually finished same day',
    };
  }
  if (behaviour.rate <= FLEXIBLE_SAME_DAY_RATE) {
    return {
      urgency: 'flexible',
      behaviourHint: 'Often moves forward',
    };
  }
  return { urgency: 'neutral', behaviourHint: null };
}

export function profileTask(
  task: Task,
  history: HistoricalTask[],
  clusters?: TaskCluster[]
): DayFitProfile {
  const cap = capacityMinsForTask(task, history, clusters);
  const urg = urgencyForTask(task, history);
  return {
    capacityMins: cap.mins,
    urgency: urg.urgency,
    inferred: cap.inferred,
    behaviourHint: urg.behaviourHint,
  };
}

/**
 * When adding incomingCost minutes would overflow remaining window,
 * pick flexible (then neutral) tasks to carry until the day fits — never anchors.
 */
export function planOverflowCarry(params: {
  openTasks: Task[];
  history: HistoricalTask[];
  clusters?: TaskCluster[];
  remainingWindowMins: number;
  incomingCostMins: number;
  protectId?: string | null;
  workDays?: number[];
}): OverflowCarryPlan {
  const {
    openTasks,
    history,
    clusters,
    remainingWindowMins,
    incomingCostMins,
    protectId,
    workDays = [1, 2, 3, 4, 5],
  } = params;

  const profiles = openTasks.map((t) => ({
    task: t,
    profile: profileTask(t, history, clusters),
  }));

  let load =
    profiles.reduce((s, p) => s + p.profile.capacityMins, 0) + Math.max(0, incomingCostMins);

  if (load <= remainingWindowMins) {
    return { carryIds: [], message: '' };
  }

  const candidates = profiles
    .filter((p) => p.task.id !== protectId && p.profile.urgency !== 'anchor')
    .sort((a, b) => {
      const rank = (u: UrgencyClass) => (u === 'flexible' ? 0 : u === 'neutral' ? 1 : 2);
      const d = rank(a.profile.urgency) - rank(b.profile.urgency);
      if (d !== 0) return d;
      return b.profile.capacityMins - a.profile.capacityMins;
    });

  const carryIds: string[] = [];
  const carriedTitles: string[] = [];

  for (const c of candidates) {
    if (load <= remainingWindowMins) break;
    carryIds.push(c.task.id);
    carriedTitles.push(c.task.text);
    load -= c.profile.capacityMins;
  }

  if (carryIds.length === 0) {
    return {
      carryIds: [],
      message:
        load > remainingWindowMins
          ? 'Day is full of work that usually needs today — nothing safe to move automatically.'
          : '',
    };
  }

  const next = nextWorkSurfaceDate(new Date(), workDays);
  const label =
    carriedTitles.length === 1
      ? `“${truncate(carriedTitles[0], 40)}” carried to make room.`
      : `${carriedTitles.length} flexible items carried to make room.`;

  return {
    carryIds,
    message: label + (next ? ` Surfaces ${next}.` : ''),
  };
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

/** Incoming cost for a brand-new capture before it exists as a Task. */
export function incomingCaptureCost(params: {
  text: string;
  estimateMins: number;
  history: HistoricalTask[];
  clusters?: TaskCluster[];
}): number {
  const fake = {
    text: params.text,
    estimate_mins: params.estimateMins,
    logged_mins: 0,
    status: 'pending' as const,
    started_at: null,
    due_today: false,
    intended_time: null,
  };
  return capacityMinsForTask(fake, params.history, params.clusters).mins;
}
