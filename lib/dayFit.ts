/**
 * Day fit — honest capacity when estimates are missing, and overflow carry
 * when the day is full.
 *
 * Deterministic. No AI. Tool conforms to the user.
 *
 * Phase 6–8: capacity bias, fit, sequence-aware overflow under calendar pressure.
 * Phase 5 context build: sequenceOrderIdsForOpenTasks for capacity_first list order.
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
import { decideTaskFit, type FitDecision } from '@/lib/thinking/v3/fit';
import {
  structuralFeaturesFromTask,
  isColdStartDuration,
} from '@/lib/thinking/v3/coldStart';
import {
  minsToNextCommitment,
  meetingDensityInWindow,
  planCapacitySequence,
  sequenceItemFromProfile,
} from '@/lib/thinking/v3/sequence';

export type { RuntimeObservations } from '@/lib/thinking/runtimeObservations';
export { buildRuntimeObservations, lookupTaskSignals } from '@/lib/thinking/runtimeObservations';
export type { FitDecision } from '@/lib/thinking/v3/fit';
export { decideTaskFit } from '@/lib/thinking/v3/fit';

export const SOFT_DEFAULT_MINS = 30;

const MIN_BEHAVIOUR_SAMPLES = 2;
const DEFAULT_ANCHOR_SAME_DAY_RATE = 0.55;
const DEFAULT_FLEXIBLE_SAME_DAY_RATE = 0.4;

export type UrgencyClass = 'anchor' | 'flexible' | 'neutral';

export type DayFitProfile = {
  capacityMins: number;
  urgency: UrgencyClass;
  inferred: boolean;
  behaviourHint: string | null;
  protectFromCarry: boolean;
  /** Phase 7+ — optional fit decision. */
  fit?: FitDecision | null;
};

export type OverflowCarryPlan = {
  carryIds: string[];
  message: string;
};

export type ProfileCalendarOpts = {
  remainingWindowMins?: number | null;
  commitments?: Array<{ start: Date; end: Date }>;
  now?: Date;
  workEndMins?: number;
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
  return vals.length % 2 === 0
    ? Math.round((vals[mid - 1] + vals[mid]) / 2)
    : vals[mid];
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
  task: Pick<
    Task,
    | 'text'
    | 'estimate_mins'
    | 'logged_mins'
    | 'status'
    | 'started_at'
    | 'due_today'
    | 'intended_time'
  >,
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
  const biasScale = signals?.capacityBiasScale ?? 1;

  const varianceBump =
    signals?.clusterBehaviour?.highVariance ? softFloor * 0.15 : 0;

  if (task.estimate_mins > 0) {
    const eff = effectiveEstimate(
      task.estimate_mins,
      suggestion,
      runtime?.blendScale
    );
    const adjusted = Math.round(eff * biasScale);
    return {
      mins: Math.max(adjusted - logged, 0),
      inferred: false,
      explain: signals?.explainDuration ?? null,
    };
  }

  if (suggestion && suggestion.suggestedMins > 0) {
    const adjusted = Math.round(suggestion.suggestedMins * biasScale);
    return {
      mins: Math.max(adjusted - logged, softFloor * 0.5 + varianceBump),
      inferred: true,
      explain: signals?.explainDuration ?? null,
    };
  }

  if (median != null && median > 0) {
    const adjusted = Math.round(median * biasScale);
    return {
      mins: Math.max(adjusted - logged, softFloor * 0.5 + varianceBump),
      inferred: true,
      explain: signals?.explainDuration ?? `≈ ${median}m typical for you`,
    };
  }

  return {
    mins: Math.max(softFloor - logged + varianceBump, 5),
    inferred: true,
    explain:
      runtime?.calibrationExplain ??
      'Not enough history yet — using a soft default',
  };
}

export function urgencyForTask(
  task: Pick<
    Task,
    'text' | 'due_today' | 'intended_time' | 'estimate_mins' | 'status'
  >,
  history: HistoricalTask[],
  runtime?: RuntimeObservations | null
): {
  urgency: UrgencyClass;
  behaviourHint: string | null;
  protectFromCarry: boolean;
} {
  if (task.status === 'active') {
    return { urgency: 'anchor', behaviourHint: null, protectFromCarry: true };
  }

  if (task.intended_time && task.intended_time.length > 0) {
    return { urgency: 'anchor', behaviourHint: null, protectFromCarry: true };
  }

  const anchorRate = runtime?.anchorSameDayRate ?? DEFAULT_ANCHOR_SAME_DAY_RATE;
  const flexibleRate =
    runtime?.flexibleSameDayRate ?? DEFAULT_FLEXIBLE_SAME_DAY_RATE;

  const signals = runtime ? lookupTaskSignals(task.text, runtime) : null;
  const behaviour =
    signals && signals.sameDayRate != null
      ? { rate: signals.sameDayRate, samples: signals.sameDaySamples }
      : similarSameDayRate(task.text, history);

  const carryHeavy =
    signals?.clusterBehaviour?.carryRate != null &&
    signals.clusterBehaviour.carryRate >= 0.5 &&
    signals.clusterBehaviour.sampleCount >= MIN_BEHAVIOUR_SAMPLES;

  if (behaviour && behaviour.rate >= anchorRate) {
    return {
      urgency: 'anchor',
      behaviourHint:
        signals?.explainBehaviour ?? 'Usually finished same day',
      protectFromCarry: true,
    };
  }
  if (carryHeavy || (behaviour && behaviour.rate <= flexibleRate)) {
    return {
      urgency: 'flexible',
      behaviourHint:
        signals?.explainBehaviour ?? 'Often moves forward',
      protectFromCarry: false,
    };
  }

  return { urgency: 'neutral', behaviourHint: null, protectFromCarry: true };
}

export function profileTask(
  task: Task,
  history: HistoricalTask[],
  clusters?: TaskCluster[],
  runtime?: RuntimeObservations | null,
  remainingWindowMins?: number | null,
  calendarOpts?: ProfileCalendarOpts | null
): DayFitProfile {
  const rt = runtime ?? null;
  const now = calendarOpts?.now ?? new Date();
  const window =
    calendarOpts?.remainingWindowMins ?? remainingWindowMins ?? null;
  const commitments = calendarOpts?.commitments ?? [];
  const nextCommit =
    commitments.length > 0 ? minsToNextCommitment(now, commitments) : null;
  const density =
    calendarOpts?.workEndMins != null && commitments.length > 0
      ? meetingDensityInWindow(now, calendarOpts.workEndMins, commitments)
      : null;

  const cap = capacityMinsForTask(
    task,
    history,
    clusters ?? rt?.clusters,
    now.getTime(),
    rt
  );
  const urg = urgencyForTask(task, history, rt);
  const signals = rt ? lookupTaskSignals(task.text, rt, { jobId: task.job_id, locationText: task.location_text }) : null;

  let fit: FitDecision | null = null;
  if (rt != null) {
    try {
      fit = decideTaskFit({
        capacityMins: cap.mins,
        remainingWindowMins: window,
        sameDayRate: signals?.sameDayRate ?? null,
        protectFromCarry: urg.protectFromCarry,
        dueToday: Boolean(task.due_today),
        hasIntendedTime: Boolean(
          task.intended_time && task.intended_time.length > 0
        ),
        isActive: task.status === 'active',
        behaviour: rt.behaviour,
        clusterBehaviour: signals?.clusterBehaviour ?? null,
        duration: signals?.hierarchicalDuration ?? null,
        capacityBiasScale: signals?.capacityBiasScale ?? 1,
        structural: structuralFeaturesFromTask({
          text: task.text,
          job_id: task.job_id,
          location_text: task.location_text,
          estimate_mins: task.estimate_mins,
          logged_mins: task.logged_mins,
          due_today: task.due_today,
          intended_time: task.intended_time,
        }),
        calendar: {
          remainingWindowMins: window,
          minsToNextCommitment: nextCommit,
          meetingDensity: density,
        },
      });
    } catch {
      // Fit must never blank the Today surface.
      fit = null;
    }
  }

  return {
    capacityMins: cap.mins,
    urgency: urg.urgency,
    inferred: cap.inferred,
    behaviourHint: urg.behaviourHint ?? cap.explain,
    protectFromCarry: urg.protectFromCarry,
    fit,
  };
}

/**
 * Recommended open-task order under the same pressure model as overflow/carry.
 * Pure. Used by capacity_first so the list and auto-carry agree.
 */
export function sequenceOrderIdsForOpenTasks(params: {
  openTasks: Task[];
  history: HistoricalTask[];
  clusters?: TaskCluster[];
  runtime?: RuntimeObservations | null;
  remainingWindowMins: number;
  commitments?: Array<{ start: Date; end: Date }>;
  now?: Date;
  workEndMins?: number;
}): string[] {
  const window = Math.max(0, params.remainingWindowMins);
  const runtime =
    params.runtime ??
    (params.history.length > 0 ? buildRuntimeObservations(params.history) : null);
  const clusterList = params.clusters ?? runtime?.clusters;
  const calendarOpts = {
    remainingWindowMins: window,
    commitments: params.commitments,
    now: params.now,
    workEndMins: params.workEndMins,
  };
  const sequenceItems = params.openTasks.map((t) => {
    const profile = profileTask(
      t,
      params.history,
      clusterList,
      runtime,
      window,
      calendarOpts
    );
    return sequenceItemFromProfile({
      id: t.id,
      capacityMins: profile.capacityMins,
      urgency: profile.urgency,
      protectFromCarry: profile.protectFromCarry,
      fit: profile.fit,
      orderIndex: t.order_index,
      text: t.text,
    });
  });
  return planCapacitySequence({
    items: sequenceItems,
    remainingWindowMins: window,
  }).orderedIds;
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
  /** Phase 8 — fixed calendar blocks for commitment pressure. */
  commitments?: Array<{ start: Date; end: Date }>;
  now?: Date;
  workEndMins?: number;
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
  const calendarOpts = {
    remainingWindowMins: window,
    commitments: params.commitments,
    now: params.now,
    workEndMins: params.workEndMins,
  };

  const profiles = openTasks.map((t) => ({
    task: t,
    profile: profileTask(t, history, clusterList, runtime, window, calendarOpts),
  }));

  const sequenceItems = profiles.map((p) =>
    sequenceItemFromProfile({
      id: p.task.id,
      capacityMins: p.profile.capacityMins,
      urgency: p.profile.urgency,
      protectFromCarry: p.profile.protectFromCarry,
      fit: p.profile.fit,
      orderIndex: p.task.order_index,
      text: p.task.text,
    })
  );

  const plan = planCapacitySequence({
    items: sequenceItems,
    remainingWindowMins: window,
    incomingCostMins,
    protectIds: params.protectId ? [params.protectId] : [],
  });

  if (plan.carryIds.length === 0) {
    return {
      carryIds: [],
      message:
        plan.totalLoadMins > window
          ? 'Day is full. Nothing here usually moves forward on its own — carry something manually if needed.'
          : '',
    };
  }

  const byId = new Map(profiles.map((p) => [p.task.id, p]));
  const carryIds = plan.carryIds;
  const carriedTitles: string[] = [];
  const carriedHints: string[] = [];
  for (const id of carryIds) {
    const p = byId.get(id);
    if (!p) continue;
    carriedTitles.push(p.task.text);
    if (p.profile.behaviourHint) carriedHints.push(p.profile.behaviourHint);
  }
  let load =
    plan.totalLoadMins -
    carryIds.reduce((s, id) => {
      const p = byId.get(id);
      return s + (p?.profile.capacityMins ?? 0);
    }, 0);

  const next = nextWorkSurfaceDate(new Date(), workDays);

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
    const soft =
      uniqueHints[0].charAt(0).toLowerCase() + uniqueHints[0].slice(1);
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
    (params.history.length > 0
      ? buildRuntimeObservations(params.history)
      : null);
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
