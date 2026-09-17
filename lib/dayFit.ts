/**
 * Day fit — honest capacity when estimates are missing, and overflow carry
 * when new work arrives on a full day.
 *
 * Deterministic. No AI. Aligns with: tool conforms to the user.
 *
 * Capacity (what fits):
 * 1. Typed estimate > 0 (blended with learned when confident)
 * 2. Learned duration from similar completed work
 * 3. Personal median of all actuals
 * 4. Soft floor so untimed work never costs zero
 *
 * Carry under pressure (what can move):
 * - Never auto-move: the task just captured, anything with intended_time,
 *   or work that usually finishes same-day (behavioural anchor).
 * - due_today alone does NOT block carry (DB defaults / casual flags
 *   would otherwise freeze the whole list).
 * - Prefer: flexible (often moves) → neutral → everything else eligible.
 */

import {
  suggestEstimate,
  effectiveEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';
import { nextWorkSurfaceDate } from '@/lib/realityCapture';

/** Soft floor (minutes) when nothing else is known. Capacity only. */
export const SOFT_DEFAULT_MINS = 30;

const MIN_BEHAVIOUR_SAMPLES = 2;
const ANCHOR_SAME_DAY_RATE = 0.55;
const FLEXIBLE_SAME_DAY_RATE = 0.4;

export type UrgencyClass = 'anchor' | 'flexible' | 'neutral';

export type DayFitProfile = {
  capacityMins: number;
  urgency: UrgencyClass;
  inferred: boolean;
  behaviourHint: string | null;
  /** Hard protect from auto-carry (intended time or strong same-day pattern). */
  protectFromCarry: boolean;
};

export type OverflowCarryPlan = {
  carryIds: string[];
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

export function personalMedianActual(history: HistoricalTask[]): number | null {
  const vals = history
    .map((h) => h.actual_mins)
    .filter((m) => typeof m === 'number' && m > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? Math.round((vals[mid - 1] + vals[mid]) / 2) : vals[mid];
}

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
    if (sameCalendarDay(h.created_at, h.completed_at)) sameDay++;
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
    return {
      mins: Math.max(suggestion.suggestedMins - logged, SOFT_DEFAULT_MINS * 0.5),
      inferred: true,
    };
  }

  const median = personalMedianActual(history);
  if (median != null && median > 0) {
    return {
      mins: Math.max(median - logged, SOFT_DEFAULT_MINS * 0.5),
      inferred: true,
    };
  }

  return { mins: Math.max(SOFT_DEFAULT_MINS - logged, 5), inferred: true };
}

export function urgencyForTask(
  task: Pick<Task, 'text' | 'due_today' | 'intended_time' | 'estimate_mins'>,
  history: HistoricalTask[]
): { urgency: UrgencyClass; behaviourHint: string | null; protectFromCarry: boolean } {
  if (task.intended_time && task.intended_time.length > 0) {
    return { urgency: 'anchor', behaviourHint: null, protectFromCarry: true };
  }

  const behaviour = similarSameDayRate(task.text, history);
  if (behaviour && behaviour.rate >= ANCHOR_SAME_DAY_RATE) {
    return {
      urgency: 'anchor',
      behaviourHint: 'Usually finished same day',
      protectFromCarry: true,
    };
  }
  if (behaviour && behaviour.rate <= FLEXIBLE_SAME_DAY_RATE) {
    return {
      urgency: 'flexible',
      behaviourHint: 'Often moves forward',
      protectFromCarry: false,
    };
  }

  // due_today is a soft preference only — does not block auto-carry.
  if (task.due_today) {
    return { urgency: 'neutral', behaviourHint: null, protectFromCarry: false };
  }

  return { urgency: 'neutral', behaviourHint: null, protectFromCarry: false };
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
    protectFromCarry: urg.protectFromCarry,
  };
}

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

  const window = Math.max(0, remainingWindowMins);

  const profiles = openTasks.map((t) => ({
    task: t,
    profile: profileTask(t, history, clusters),
  }));

  let load =
    profiles.reduce((s, p) => s + p.profile.capacityMins, 0) + Math.max(0, incomingCostMins);

  if (load <= window) {
    return { carryIds: [], message: '' };
  }

  const rank = (u: UrgencyClass) => (u === 'flexible' ? 0 : u === 'neutral' ? 1 : 2);

  const candidates = profiles
    .filter(
      (p) =>
        p.task.id !== protectId &&
        !p.profile.protectFromCarry &&
        p.task.status !== 'active'
    )
    .sort((a, b) => {
      const d = rank(a.profile.urgency) - rank(b.profile.urgency);
      if (d !== 0) return d;
      return b.profile.capacityMins - a.profile.capacityMins;
    });

  const carryIds: string[] = [];
  const carriedTitles: string[] = [];

  for (const c of candidates) {
    if (load <= window) break;
    carryIds.push(c.task.id);
    carriedTitles.push(c.task.text);
    load -= c.profile.capacityMins;
  }

  if (carryIds.length === 0) {
    return {
      carryIds: [],
      message:
        load > window
          ? 'Day is full — everything left usually needs today or is in progress.'
          : '',
    };
  }

  const next = nextWorkSurfaceDate(new Date(), workDays);
  const label =
    carriedTitles.length === 1
      ? `“${truncate(carriedTitles[0], 40)}” carried to make room.`
      : `${carriedTitles.length} items carried to make room.`;

  return {
    carryIds,
    message: label + (next ? ` Surfaces ${next}.` : ''),
  };
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

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
