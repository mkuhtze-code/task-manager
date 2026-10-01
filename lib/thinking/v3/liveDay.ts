/**
 * Live day model — presentation-facing plan derived from authoritative
 * dayFit + sequence + availability. Pure. Deterministic.
 *
 * Temporal packing: free windows (interval complement) + ordered first-fit.
 * Does not replace decideTaskFit / planCapacitySequence; composes them and
 * adds contiguous-window honesty so Σ free ≠ “fits”.
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

/** Free interval on the working horizon (geometry, not just duration). */
export type FreeWindow = {
  startMs: number;
  endMs: number;
  mins: number;
};

export type PackedPlacement = {
  id: string;
  windowIndex: number;
  /** Projected start if work ran back-to-back in this window. */
  startMs: number;
  endMs: number;
  costMins: number;
};

export type PackResult = {
  placed: PackedPlacement[];
  placedIds: string[];
  overflowIds: string[];
  /** Windows after packing (remaining capacity per slot). */
  windowsRemaining: FreeWindow[];
};

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
  /** True when ordered first-fit found a contiguous free window. */
  inWindow: boolean;
  /** Projected start within a free window (ms since epoch), if packed. */
  projectedStartMs: number | null;
  projectedEndMs: number | null;
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
  pack: PackResult;
  freeWindows: FreeWindow[];
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

function softenEngineReason(raw: string): string {
  return raw
    .replace(
      /^using structure until personal evidence builds$/i,
      'Using structure until more of your history builds'
    )
    .replace(/^would overrun next commitment$/i, 'Would run into the next fixed commitment')
    .replace(/^exceeds remaining window; often moves forward$/i, 'More than the remaining day; this kind of work often moves')
    .replace(/^exceeds remaining window$/i, 'More than the remaining workable day')
    .replace(/^day over capacity/i, 'Day is already full')
    .trim();
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function humanReason(
  profile: DayFitProfile,
  inWindow: boolean,
  packFail: 'none' | 'no_window' | 'fragmented',
  largestMins: number,
  cost: number
): string {
  if (packFail === 'fragmented' && cost > 0) {
    if (largestMins <= 0) {
      return 'No free block left in the working day.';
    }
    return `Needs about ${cost}m uninterrupted; largest free block is ${largestMins}m.`;
  }
  if (packFail === 'no_window' && cost > 0) {
    return 'No room left in the remaining free blocks.';
  }

  const fit = profile.fit?.fit ?? 'unknown';
  const fromEngine = profile.fit?.reasons?.[0];
  if (fromEngine && fromEngine.length < 100) {
    const r = softenEngineReason(fromEngine);
    if (r) return r;
  }
  if (fit === 'protect') return 'Protected — stays in place unless you move it.';
  if (fit === 'strong') {
    return inWindow
      ? 'Fits comfortably with what you usually need for similar work.'
      : 'Usually fits this kind of work, but not in today’s free blocks.';
  }
  if (fit === 'possible') {
    return inWindow
      ? 'Fits in the remaining day.'
      : 'May fit if earlier work finishes on time.';
  }
  if (fit === 'uncertain') return 'Not enough evidence yet to be sure.';
  if (fit === 'poor') return 'Likely later — not enough uninterrupted room from here.';
  if (fit === 'blocked') return 'Blocked by fixed time or missing context.';
  if (fit === 'carry_safe') return 'Flexible — can move if the day tightens.';
  return 'Not enough evidence yet.';
}

/**
 * Interval complement of commitments on [now, workEnd].
 * Merges overlapping busy blocks, then emits free windows with geometry.
 */
export function freeWindows(
  now: Date,
  workEndMins: number,
  commitments: Array<{ start: Date; end: Date }>
): FreeWindow[] {
  const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (nowMins >= workEndMins) return [];

  const horizonStart = now.getTime();
  const remainingDayMins = workEndMins - nowMins;
  const horizonEnd = horizonStart + remainingDayMins * 60000;

  const raw = commitments
    .map((c) => ({
      start: Math.max(c.start.getTime(), horizonStart),
      end: Math.min(c.end.getTime(), horizonEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  // Merge overlaps / touches
  const busy: Array<{ start: number; end: number }> = [];
  for (const b of raw) {
    const last = busy[busy.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      busy.push({ start: b.start, end: b.end });
    }
  }

  const windows: FreeWindow[] = [];
  let cursor = horizonStart;
  for (const b of busy) {
    if (b.start > cursor) {
      const mins = Math.round((b.start - cursor) / 60000);
      if (mins > 0) {
        windows.push({ startMs: cursor, endMs: b.start, mins });
      }
    }
    cursor = Math.max(cursor, b.end);
  }
  if (horizonEnd > cursor) {
    const mins = Math.round((horizonEnd - cursor) / 60000);
    if (mins > 0) {
      windows.push({ startMs: cursor, endMs: horizonEnd, mins });
    }
  }
  return windows;
}

/** Length-only view (tests / simple callers). */
export function freeWindowsMins(
  now: Date,
  workEndMins: number,
  commitments: Array<{ start: Date; end: Date }>
): number[] {
  return freeWindows(now, workEndMins, commitments).map((w) => w.mins);
}

export function largestWindowMins(windows: number[] | FreeWindow[]): number {
  if (windows.length === 0) return 0;
  if (typeof windows[0] === 'number') {
    return Math.max(...(windows as number[]));
  }
  return Math.max(...(windows as FreeWindow[]).map((w) => w.mins));
}

/**
 * Ordered first-fit into free windows.
 * Preserves sequence order. Tasks are atomic (one contiguous block).
 * costMins <= 0 are treated as placed without consuming a window.
 */
export function packOrderedIntoWindows(
  ordered: Array<{ id: string; costMins: number }>,
  windowsIn: FreeWindow[]
): PackResult {
  const windows: FreeWindow[] = windowsIn.map((w) => ({ ...w }));
  const placed: PackedPlacement[] = [];
  const overflowIds: string[] = [];

  for (const item of ordered) {
    const cost = Math.max(0, Math.round(item.costMins));
    if (cost <= 0) {
      placed.push({
        id: item.id,
        windowIndex: -1,
        startMs: windows[0]?.startMs ?? 0,
        endMs: windows[0]?.startMs ?? 0,
        costMins: 0,
      });
      continue;
    }

    let packed = false;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (w.mins + 0.5 >= cost) {
        const startMs = w.startMs;
        const endMs = startMs + cost * 60000;
        placed.push({
          id: item.id,
          windowIndex: i,
          startMs,
          endMs,
          costMins: cost,
        });
        // Consume from the front of this window (back-to-back in order)
        w.startMs = endMs;
        w.mins = Math.max(0, Math.round((w.endMs - w.startMs) / 60000));
        packed = true;
        break;
      }
    }
    if (!packed) overflowIds.push(item.id);
  }

  return {
    placed,
    placedIds: placed.map((p) => p.id),
    overflowIds,
    windowsRemaining: windows.filter((w) => w.mins > 0),
  };
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

  const carrySet = new Set(sequence.carryIds);

  const order =
    params.orderedIds && params.orderedIds.length > 0
      ? params.orderedIds.filter((id) => open.some((t) => t.id === id))
      : sequence.orderedIds.slice();

  for (const t of open) {
    if (!order.includes(t.id)) order.push(t.id);
  }

  const windows: FreeWindow[] =
    params.workEndMins != null
      ? freeWindows(now, params.workEndMins, commitments)
      : window > 0
        ? [
            {
              startMs: now.getTime(),
              endMs: now.getTime() + window * 60000,
              mins: window,
            },
          ]
        : [];

  const largest = largestWindowMins(windows);

  const packItems = order.map((id) => ({
    id,
    costMins: profiles.get(id)?.capacityMins ?? 0,
  }));
  const pack = packOrderedIntoWindows(packItems, windows);
  const placedById = new Map(pack.placed.map((p) => [p.id, p]));
  const packOverflow = new Set(pack.overflowIds);

  let cumulative = 0;
  const tasks: LiveTaskPlan[] = [];
  const byId: Record<string, LiveTaskPlan> = {};

  for (const id of order) {
    const profile = profiles.get(id);
    if (!profile) continue;
    const cap = Math.max(0, profile.capacityMins);
    const fit = (profile.fit?.fit ?? 'unknown') as FitState;
    const placement = placedById.get(id);
    const inWindow = placement != null && !packOverflow.has(id);

    // Pack failure mode for reasons
    let packFail: 'none' | 'no_window' | 'fragmented' = 'none';
    if (!inWindow && cap > 0) {
      packFail =
        largest > 0 && cap > largest + 5 ? 'fragmented' : 'no_window';
    }

    // Presentation fit: keep engine protect/blocked; demote strong/possible
    // when packing failed due to fragmentation.
    let presentFit = fit;
    if (
      !inWindow &&
      (fit === 'strong' || fit === 'possible') &&
      !profile.protectFromCarry
    ) {
      presentFit = 'poor';
    }
    if (fit === 'blocked') presentFit = 'blocked';
    if (fit === 'protect') presentFit = 'protect';

    const start = cumulative;
    cumulative += cap;

    const reason = humanReason(profile, inWindow, packFail, largest, cap);
    // Optional: append projected time when packed and useful
    let finalReason = reason;
    if (inWindow && placement && placement.windowIndex >= 0 && placement.costMins > 0) {
      const clock = formatClock(placement.startMs);
      if (!reason.includes(clock)) {
        // Keep primary reason; clock is structural not chatty
        finalReason =
          presentFit === 'protect' || presentFit === 'strong' || presentFit === 'possible'
            ? reason
            : reason;
      }
    }

    const plan: LiveTaskPlan = {
      id,
      fit: presentFit,
      fitLabel: FIT_LABEL[presentFit] ?? 'Not enough evidence',
      confidence: profile.fit?.confidence ?? null,
      estimatedRemainingMins: cap,
      cumulativeStartMins: start,
      cumulativeEndMins: cumulative,
      reason: finalReason,
      protected: profile.protectFromCarry || fit === 'protect',
      movable:
        carrySet.has(id) ||
        fit === 'carry_safe' ||
        profile.urgency === 'flexible',
      inWindow,
      projectedStartMs: placement && inWindow ? placement.startMs : null,
      projectedEndMs: placement && inWindow ? placement.endMs : null,
    };
    tasks.push(plan);
    byId[id] = plan;
  }

  const fitsIds = tasks
    .filter(
      (t) =>
        t.inWindow &&
        t.fit !== 'poor' &&
        t.fit !== 'blocked'
    )
    .map((t) => t.id);
  const uncertainIds = tasks
    .filter(
      (t) =>
        t.fit === 'uncertain' ||
        t.fit === 'unknown' ||
        t.fit === 'needs_context'
    )
    .map((t) => t.id);
  const movableIds = tasks
    .filter((t) => t.movable && !t.protected)
    .map((t) => t.id);
  const overflowIds = tasks
    .filter((t) => !t.inWindow || t.fit === 'poor')
    .map((t) => t.id);

  const plannedTaskMins = tasks.reduce(
    (s, t) => s + t.estimatedRemainingMins,
    0
  );
  const remainingWorkMins = params.remainingWorkMins ?? sequence.totalLoadMins;

  let status: LiveDayStatus;
  if (open.length === 0 || plannedTaskMins <= 0) status = 'clear';
  else if (
    remainingWorkMins > window + 15 ||
    overflowIds.length > fitsIds.length
  )
    status = 'overloaded';
  else if (remainingWorkMins > window * 0.85 || overflowIds.length > 0)
    status = 'tight';
  else status = 'comfortable';

  const nextTaskId =
    tasks.find((t) => t.fit === 'protect' || t.inWindow)?.id ??
    tasks[0]?.id ??
    null;

  const dayRead =
    status === 'clear'
      ? "You're clear for the rest of today."
      : status === 'overloaded'
        ? 'Remaining work no longer fits the free blocks in the day.'
        : status === 'tight'
          ? 'The remainder is getting tight against real free time.'
          : 'The remaining work looks workable in the free blocks from here.';

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
    pack,
    freeWindows: windows,
    dayRead,
    minsToNextCommitment: minsToNextCommitment(now, commitments),
  };
}
