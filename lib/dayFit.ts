/**
 * Day fit — honest capacity when estimates are missing, and overflow carry
 * when the day is full.
 *
 * Deterministic. No AI. Tool conforms to the user.
 *
 * Runtime observations (optional): pass buildRuntimeObservations(history)
 * so duration + behaviour match the same cluster as capture chips.
 * softFloorMins on the runtime bundle may be calibrated from prediction outcomes.
 */

import {
  suggestEstimate,
  effectiveEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';
import { nextWorkSurfaceDate } from '@/lib/realityCapture';
import {
  buildRuntimeObservations,
  lookupTaskSignals,
  type RuntimeObservations,
} from '@/lib/thinking/runtimeObservations';

export type { RuntimeObservations } from '@/lib/thinking/runtimeObservations';
export { buildRuntimeObservations, lookupTaskSignals } from '@/lib/thinking/runtimeObservations';

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
  nowMs: number = Date.now(),
  runtime?: RuntimeObservations | null
): { mins: number; inferred: boolean; explain: string | null } {
  let logged = task.logged_mins || 0;
  if (task.status === 'active' && task.started_at) {
    logged += (nowMs - new Date(task.started_at).getTime()) / 60000;
  }

  const signals = runtime ? lookupTaskSignals(task.text, runtime) : null;
  const suggestion =
    signals?.estimate ??
    suggestEstimate(task.text, history, clusters ?? runtime?.clusters);
  const median = runtime?.personalMedian ?? personalMedianActual(history);
  const softFloor = runtime?.softFloorMins ?? SOFT_DEFAULT_MINS;

  if (task.estimate_mins > 0) {
    const eff = effectiveEstimate(
      task.estimate_mins,
      suggestion,
      runtime?.blendScale
    );
    return {
      mins: Math.max(eff - logged, 0),
      inferred: false,
      explain: signals?.explainDuration ?? null,
    };
  }

  if (suggestion && suggestion.suggestedMins > 0) {
    return {
      mins: Math.max(suggestion.suggestedMins - logged, softFloor * 0.5),
      inferred: true,
      explain: signals?.explainDuration ?? null,
    };
  }

  if (median != null && median > 0) {
    return {
      mins: Math.max(median - logged, softFloor * 0.5),
      inferred: true,
      explain: signals?.explainDuration ?? `≈ ${median}m typical for you`,
    };
  }

  return {
    mins: Math.max(softFloor - logged, 5),
    inferred: true,
    explain:
      runtime?.calibrationExplain ??
      'Not enough history yet — using a soft default',
  };
}

export function urgencyForTask(
  task: Pick<Task, 'text' | 'due_today' | 'intended_time' | 'estimate_mins' | 'status'>,
  history: HistoricalTask[],
  runtime?: RuntimeObservations | null
): { urgency: UrgencyClass; behaviourHint: string | null; protectFromCarry: boolean } {
  if (task.status === 'active') {
    return { urgency: 'anchor', behaviourHint: null, protectFromCarry: true };
  }

  if (task.intended_time && task.intended_time.length > 0) {
    return { urgency: 'anchor', behaviourHint: null, protectFromCarry: true };
  }

  const signals = runtime ? lookupTaskSignals(task.text, runtime) : null;
  const behaviour =
    signals && signals.sameDayRate != null
      ? { rate: signals.sameDayRate, samples: signals.sameDaySamples }
      : similarSameDayRate(task.text, history);

  if (behaviour && behaviour.rate >= ANCHOR_SAME_DAY_RATE) {
    return {
      urgency: 'anchor',
      behaviourHint: signals?.explainBehaviour ?? 'Usually finished same day',
      protectFromCarry: true,
    };
  }
  if (behaviour && behaviour.rate <= FLEXIBLE_SAME_DAY_RATE) {
    return {
      urgency: 'flexible',
      behaviourHint: signals?.explainBehaviour ?? 'Often moves forward',
      protectFromCarry: false,
    };
  }

  return { urgency: 'neutral', behaviourHint: null, protectFromCarry: true };
}

export function profileTask(
  task: Task,
  history: HistoricalTask[],
  clusters?: TaskCluster[],
  runtime?: RuntimeObservations | null
): DayFitProfile {
  const rt = runtime ?? null;
  const cap = capacityMinsForTask(task, history, clusters ?? rt?.clusters, Date.now(), rt);
  const urg = urgencyForTask(task, history, rt);
  return {
    capacityMins: cap.mins,
    urgency: urg.urgency,
    inferred: cap.inferred,
    behaviourHint: urg.behaviourHint ?? cap.explain,
    protectFromCarry: urg.protectFromCarry,
  };
}

export function planOverflowCarry(params: {
  openTasks: Task[];
  history: HistoricalTask[];
  clusters?: TaskCluster[];
  runtime?: RuntimeObservations | null;
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
    workDays = [1, 2, 3, 4, 5],
  } = params;

  const runtime =
    params.runtime ??
    (history.length > 0 ? buildRuntimeObservations(history) : null);
  const clusterList = clusters ?? runtime?.clusters;

  const window = Math.max(0, remainingWindowMins);

  const profiles = openTasks.map((t) => ({
    task: t,
    profile: profileTask(t, history, clusterList, runtime),
  }));

  let load =
    profiles.reduce((s, p) => s + p.profile.capacityMins, 0) + Math.max(0, incomingCostMins);

  if (load <= window) {
    return { carryIds: [], message: '' };
  }

  const candidates = profiles
    .filter((p) => p.profile.urgency === 'flexible' && !p.profile.protectFromCarry)
    .sort((a, b) => {
      const bySize = b.profile.capacityMins - a.profile.capacityMins;
      if (bySize !== 0) return bySize;
      return a.task.order_index - b.task.order_index;
    });

  const carryIds: string[] = [];
  const carriedTitles: string[] = [];
  const carriedHints: string[] = [];

  for (const c of candidates) {
    if (load <= window) break;
    carryIds.push(c.task.id);
    carriedTitles.push(c.task.text);
    if (c.profile.behaviourHint) carriedHints.push(c.profile.behaviourHint);
    load -= c.profile.capacityMins;
  }

  const next = nextWorkSurfaceDate(new Date(), workDays);

  if (carryIds.length === 0) {
    return {
      carryIds: [],
      message:
        load > window
          ? 'Day is full. Nothing here usually moves forward on its own — carry something manually if needed.'
          : '',
    };
  }

  // Prefer the engine's behaviourHint so the banner explains *why* this moved.
  const uniqueHints = [...new Set(carriedHints.filter(Boolean))];
  let label: string;
  if (carriedTitles.length === 1) {
    const title = truncate(carriedTitles[0], 40);
    if (uniqueHints.length === 1) {
      const hint = uniqueHints[0];
      const soft = hint.charAt(0).toLowerCase() + hint.slice(1);
      label = `“${title}” carried — ${soft}.`;
    } else {
      label = `“${title}” carried (often moves forward).`;
    }
  } else if (uniqueHints.length === 1) {
    const soft = uniqueHints[0].charAt(0).toLowerCase() + uniqueHints[0].slice(1);
    label = `${carriedTitles.length} items carried — ${soft}.`;
  } else {
    label = `${carriedTitles.length} items carried (often move forward).`;
  }

  let message = label + (next ? ` Surfaces ${next}.` : '');
  if (load > window) {
    message += ' Day is still full.';
  }

  return { carryIds, message };
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
  runtime?: RuntimeObservations | null;
}): number {
  const runtime =
    params.runtime ??
    (params.history.length > 0 ? buildRuntimeObservations(params.history) : null);
  const fake = {
    text: params.text,
    estimate_mins: params.estimateMins,
    logged_mins: 0,
    status: 'pending' as const,
    started_at: null,
    due_today: false,
    intended_time: null,
  };
  return capacityMinsForTask(
    fake,
    params.history,
    params.clusters ?? runtime?.clusters,
    Date.now(),
    runtime
  ).mins;
}
