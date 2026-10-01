/**
 * Live day model — presentation-facing plan derived from authoritative
 * dayFit + sequence + availability. Pure. Deterministic.
 *
 * Does not replace planCapacitySequence / decideTaskFit; composes them
 * into a single view of "what is realistically possible from now."
 */

import type { FitState } from '@/lib/thinking/v3/types';
import type { FitDecision } from '@/lib/thinking/v3/fit';
import {
  planCapacitySequence,
  sequenceItemFromProfile,
  minsToNextCommitment,
  type SequencePlan,
} from '@/lib/thinking/v3/sequence';
import {
  profileTask,
  type DayFitProfile,
} from '@/lib/dayFit';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import type { RuntimeObservations } from '@/lib/thinking/runtimeObservations';
import type { Task } from '@/lib/taskTypes';

export type LiveDayStatus =
  | 'comfortable'
  | 'tight'
  | 'overloaded'
  | 'clear';

export type LiveFitLabel =
  | 'Protected'
  | 'Fits well'
  | 'Fits'
  | 'Uncertain'
  | 'Likely later'
  | 'Blocked'
  | 'Can move'
  | 'Not enough evidence';

export type LiveTaskPlan = {
  id: string;
  fit: FitState;
  fitLabel: LiveFitLabel;
  confidence: FitDecision['confidence'] | null;
  estimatedRemainingMins: number;
  cumulativeStartMins: number;
  cumulativeEndMins: number;
  reason: string;
  protected: boolean;
  movable: boolean;
  inWindow: boolean;
};

export type LiveDayPlan = {
  now: Date;
  availableMins: number;
  remainingWorkMins: number;
  plannedTaskMins: number;
  fitsIds: string[];
  uncertainIds: string[];
  movableIds: string[];
  overflowIds: string[];
  nextTaskId: string | null;
  status: LiveDayStatus;
  tasks: LiveTaskPlan[];
  byId: Record<string, LiveTaskPlan>;
  sequence: SequencePlan;
  dayRead: string;
  minsToNextCommitment: number | null;
};

const FIT_LABEL: Record<string, LiveFitLabel> = {
  protect: 'Protected',
  strong: 'Fits well',
  possible: 'Fits',
  uncertain: 'Uncertain',
  poor: 'Likely later',
  blocked: 'Blocked',
  carry_safe: 'Can move',
  unknown: 'Not enough evidence',
  needs_context: 'Not enough evidence',
};

function humanReason(profile: DayFitProfile, inWindow: boolean): string {
  const fit = profile.fit?.fit ?? 'unknown';
  const fromEngine = profile.fit?.reasons?.[0];
  if (fromEngine && fromEngine.length < 90) {
    // Soften engine phrases into calm product language where possible
    const r = fromEngine
      .replace(/^using structure until personal evidence builds$/i, 'Using structure until more of your history builds')
      .replace(/^day over capacity/i, 'Day is already full')
      .trim();
    if (r) return r;
  }
  if (fit === 'protect') return 'Protected — stays in place unless you move it.';
  if (fit === 'strong') return 'Fits comfortably with what you usually need for similar work.';
  if (fit === 'possible') return inWindow
    ? 'Fits in the remaining day.'
    : 'May fit if earlier work finishes on time.';
  if (fit === 'uncertain') return 'Not enough evidence yet to be sure.';
  if (fit === 'poor') return 'Likely later — not enough uninterrupted room from here.';
  if (fit === 'blocked') return 'Blocked by fixed time or missing context.';
  if (fit === 'carry_safe') return 'Flexible — can move if the day tightens.';
  return 'Not enough evidence yet.';
}

/**
 * Build free intervals from now → work end minus commitment blocks.
 * Used only to flag contiguous-window pressure (not a full Gantt).
 */
export function freeWindowsMins(
  now: Date,
  workEndMins: number,
  commitments: Array<{ start: Date; end: Date }>
): number[] {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins >= workEndMins) return [];
  const horizonStart = now.getTime();
  const horizonEnd = horizonStart + (workEndMins - nowMins) * 60000;

  const blocks = commitments
    .map((c) => ({
      start: Math.max(c.start.getTime(), horizonStart),
      end: Math.min(c.end.getTime(), horizonEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const windows: number[] = [];
  let cursor = horizonStart;
  for (const b of blocks) {
    if (b.start > cursor) {
      windows.push(Math.round((b.start - cursor) / 60000));
    }
    cursor = Math.max(cursor, b.end);
  }
  if (horizonEnd > cursor) {
    windows.push(Math.round((horizonEnd - cursor) / 60000));
  }
  return windows.filter((w) => w > 0);
}

export function largestWindowMins(windows: number[]): number {
  if (windows.length === 0) return 0;
  return Math.max(...windows);
}

export function buildLiveDayPlan(params: {
  now: Date;
  openTasks: Task[];
  /** Prefer existing ordered list (capacity_first / geo / manual). */
  orderedIds?: string[];
  history: HistoricalTask[];
  runtime?: RuntimeObservations | null;
  remainingWindowMins: number;
  commitments?: Array<{ start: Date; end: Date }>;
  workEndMins?: number;
  /** Remaining task load already computed (timed + travel etc.) for status. */
  remainingWorkMins?: number;
}): LiveDayPlan {
  const now = params.now;
  const window = Math.max(0, params.remainingWindowMins);
  const commitments = params.commitments ?? [];
  const runtime = params.runtime ?? null;
  const open = params.openTasks.filter((t) => t.status !== 'done');

  const calendarOpts = {
    remainingWindowMins: window,
    commitments,
    now,
    workEndMins: params.workEndMins,
  };

  const profiles = new Map<string, DayFitProfile>();
  const sequenceItems = open.map((t) => {
    const profile = profileTask(
      t,
      params.history,
      runtime?.clusters,
      runtime,
      window,
      calendarOpts
    );
    profiles.set(t.id, profile);
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

  const sequence = planCapacitySequence({
    items: sequenceItems,
    remainingWindowMins: window,
  });

  const fitsSet = new Set(sequence.fitsIds);
  const carrySet = new Set(sequence.carryIds);

  const order =
    params.orderedIds && params.orderedIds.length > 0
      ? params.orderedIds.filter((id) => open.some((t) => t.id === id))
      : sequence.orderedIds;

  // Ensure every open task appears
  for (const t of open) {
    if (!order.includes(t.id)) order.push(t.id);
  }

  const windows = params.workEndMins != null
    ? freeWindowsMins(now, params.workEndMins, commitments)
    : [];
  const largest = largestWindowMins(windows);

  let cumulative = 0;
  const tasks: LiveTaskPlan[] = [];
  const byId: Record<string, LiveTaskPlan> = {};

  for (const id of order) {
    const profile = profiles.get(id);
    if (!profile) continue;
    const cap = Math.max(0, profile.capacityMins);
    const fit = (profile.fit?.fit ?? 'unknown') as FitState;
    const inWindow = fitsSet.has(id);

    // Temporal honesty: if the task needs more contiguous time than the
    // largest free window, demote presentation toward "likely later"
    // without inventing a new fit engine — only when engine already said
    // possible/strong and the window is clearly too small.
    let presentFit = fit;
    if (
      cap > 0 &&
      largest > 0 &&
      cap > largest + 5 &&
      (fit === 'strong' || fit === 'possible') &&
      !profile.protectFromCarry
    ) {
      presentFit = 'poor';
    }

    const start = cumulative;
    cumulative += cap;
    const plan: LiveTaskPlan = {
      id,
      fit: presentFit,
      fitLabel: FIT_LABEL[presentFit] ?? 'Not enough evidence',
      confidence: profile.fit?.confidence ?? null,
      estimatedRemainingMins: cap,
      cumulativeStartMins: start,
      cumulativeEndMins: cumulative,
      reason: humanReason(profile, inWindow),
      protected: profile.protectFromCarry || fit === 'protect',
      movable: carrySet.has(id) || fit === 'carry_safe' || profile.urgency === 'flexible',
      inWindow: inWindow && presentFit !== 'poor',
    };
    tasks.push(plan);
    byId[id] = plan;
  }

  const fitsIds = tasks.filter((t) => t.inWindow && t.fit !== 'poor' && t.fit !== 'blocked').map((t) => t.id);
  const uncertainIds = tasks
    .filter((t) => t.fit === 'uncertain' || t.fit === 'unknown' || t.fit === 'needs_context')
    .map((t) => t.id);
  const movableIds = tasks.filter((t) => t.movable && !t.protected).map((t) => t.id);
  const overflowIds = tasks.filter((t) => !t.inWindow || t.fit === 'poor').map((t) => t.id);

  const plannedTaskMins = tasks.reduce((s, t) => s + t.estimatedRemainingMins, 0);
  const remainingWorkMins = params.remainingWorkMins ?? sequence.totalLoadMins;

  let status: LiveDayStatus;
  if (open.length === 0 || plannedTaskMins <= 0) status = 'clear';
  else if (remainingWorkMins > window + 15 || overflowIds.length > fitsIds.length)
    status = 'overloaded';
  else if (remainingWorkMins > window * 0.85 || overflowIds.length > 0) status = 'tight';
  else status = 'comfortable';

  const nextTaskId =
    tasks.find((t) => t.fit === 'protect' || t.inWindow)?.id ??
    tasks[0]?.id ??
    null;

  const dayRead =
    status === 'clear'
      ? "You're clear for the rest of today."
      : status === 'overloaded'
        ? 'Remaining work no longer fits the day as it stands.'
        : status === 'tight'
          ? 'The remainder is getting tight.'
          : 'The remaining work looks workable from here.';

  return {
    now,
    availableMins: window,
    remainingWorkMins,
    plannedTaskMins,
    fitsIds,
    uncertainIds,
    movableIds,
    overflowIds,
    nextTaskId,
    status,
    tasks,
    byId,
    sequence,
    dayRead,
    minsToNextCommitment: minsToNextCommitment(now, commitments),
  };
}

