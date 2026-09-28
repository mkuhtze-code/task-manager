// lib/thinking/v3/sequence.ts
//
// Phase 8 — capacity sequencing under real pressure.
//
// Given open work + remaining window + fixed commitments, decide:
//   what should stay, what can move, and in what order.
//
// Pure. Deterministic. No UI surface.

import type { FitState } from './types';
import type { FitDecision } from './fit';

export type SequenceUrgency = 'anchor' | 'flexible' | 'neutral';

export type SequenceItem = {
  id: string;
  capacityMins: number;
  urgency: SequenceUrgency;
  protectFromCarry: boolean;
  fit: FitState | null;
  /** Lower = earlier in recommended order. */
  orderIndex: number;
  text?: string;
};

export type SequencePlan = {
  /** Recommended order for remaining work (ids). */
  orderedIds: string[];
  /** Items that fit in the remaining window under this order. */
  fitsIds: string[];
  /** Flexible / carry_safe items to move if the day is over capacity. */
  carryIds: string[];
  /** Total capacity load of open items (mins). */
  totalLoadMins: number;
  /** Window used for the plan. */
  remainingWindowMins: number;
  reasons: string[];
};

const FIT_RANK: Record<string, number> = {
  protect: 0,
  strong: 1,
  possible: 2,
  uncertain: 3,
  unknown: 4,
  needs_context: 4,
  poor: 5,
  blocked: 6,
  carry_safe: 7,
};

function urgencyRank(u: SequenceUrgency, protect: boolean): number {
  if (protect) return 0;
  if (u === 'anchor') return 1;
  if (u === 'neutral') return 2;
  return 3; // flexible
}

/**
 * Minutes until the next fixed commitment starts (from now).
 * Null when there is no future commitment in the list.
 */
export function minsToNextCommitment(
  now: Date,
  commitments: Array<{ start: Date; end: Date }>
): number | null {
  const nowMs = now.getTime();
  let best: number | null = null;
  for (const c of commitments) {
    const startMs = c.start.getTime();
    const endMs = c.end.getTime();
    if (!(endMs > nowMs)) continue; // already ended
    if (startMs <= nowMs) continue; // currently in progress — not "next"
    const mins = Math.round((startMs - nowMs) / 60000);
    if (mins < 0) continue;
    if (best == null || mins < best) best = mins;
  }
  return best;
}

/**
 * Fraction of remaining work window blocked by commitments (0–1).
 */
export function meetingDensityInWindow(
  now: Date,
  workEndMins: number,
  commitments: Array<{ start: Date; end: Date }>
): number | null {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins >= workEndMins) return null;
  const horizonStart = now.getTime();
  const horizonEnd = horizonStart + (workEndMins - nowMins) * 60000;
  const horizonMs = horizonEnd - horizonStart;
  if (horizonMs <= 0) return null;

  const intervals: Array<{ start: number; end: number }> = [];
  for (const c of commitments) {
    const cs = Math.max(c.start.getTime(), horizonStart);
    const ce = Math.min(c.end.getTime(), horizonEnd);
    if (ce > cs) intervals.push({ start: cs, end: ce });
  }
  intervals.sort((a, b) => a.start - b.start);

  let blocked = 0;
  let mergedEnd = -Infinity;
  for (const iv of intervals) {
    const start = Math.max(iv.start, mergedEnd);
    if (iv.end > start) {
      blocked += iv.end - start;
      mergedEnd = iv.end;
    }
  }
  return Math.min(1, Math.max(0, blocked / horizonMs));
}

/**
 * Sort open work into a pressure-aware order without mutating input.
 */
export function orderSequenceItems(items: SequenceItem[]): SequenceItem[] {
  return [...items].sort((a, b) => {
    const ua = urgencyRank(a.urgency, a.protectFromCarry);
    const ub = urgencyRank(b.urgency, b.protectFromCarry);
    if (ua !== ub) return ua - ub;

    const fa = FIT_RANK[a.fit ?? 'unknown'] ?? 4;
    const fb = FIT_RANK[b.fit ?? 'unknown'] ?? 4;
    if (fa !== fb) return fa - fb;

    // Prefer smaller blocks first among peers so more work can fit.
    if (a.capacityMins !== b.capacityMins) {
      return a.capacityMins - b.capacityMins;
    }
    return a.orderIndex - b.orderIndex;
  });
}

/**
 * Plan which open items fit the remaining window and which may carry.
 */
export function planCapacitySequence(params: {
  items: SequenceItem[];
  remainingWindowMins: number;
  incomingCostMins?: number;
  /** Never auto-carry these ids (e.g. just-captured item). */
  protectIds?: string[];
}): SequencePlan {
  const window = Math.max(0, params.remainingWindowMins);
  const incoming = Math.max(0, params.incomingCostMins ?? 0);
  const protect = new Set(params.protectIds ?? []);
  const reasons: string[] = [];

  const ordered = orderSequenceItems(params.items);
  const orderedIds = ordered.map((i) => i.id);

  let load = incoming;
  const fitsIds: string[] = [];
  for (const item of ordered) {
    if (load + item.capacityMins <= window + 0.5) {
      fitsIds.push(item.id);
      load += item.capacityMins;
    }
  }

  const totalLoadMins =
    params.items.reduce((s, i) => s + i.capacityMins, 0) + incoming;

  const carryIds: string[] = [];
  if (totalLoadMins > window) {
    const candidates = ordered
      .filter(
        (i) =>
          !protect.has(i.id) &&
          !i.protectFromCarry &&
          (i.urgency === 'flexible' || i.fit === 'carry_safe')
      )
      .sort((a, b) => {
        const bySize = b.capacityMins - a.capacityMins;
        if (bySize !== 0) return bySize;
        return a.orderIndex - b.orderIndex;
      });

    let excess = totalLoadMins - window;
    for (const c of candidates) {
      if (excess <= 0) break;
      carryIds.push(c.id);
      excess -= c.capacityMins;
    }
    if (carryIds.length > 0) {
      reasons.push(`carry ${carryIds.length} flexible item(s) to free capacity`);
    } else if (excess > 0) {
      reasons.push('day over capacity; nothing safe to auto-carry');
    }
  }

  return {
    orderedIds,
    fitsIds,
    carryIds,
    totalLoadMins,
    remainingWindowMins: window,
    reasons,
  };
}

/**
 * Map a DayFit-style profile into a SequenceItem.
 */
export function sequenceItemFromProfile(params: {
  id: string;
  capacityMins: number;
  urgency: SequenceUrgency;
  protectFromCarry: boolean;
  fit?: FitDecision | null;
  orderIndex: number;
  text?: string;
}): SequenceItem {
  return {
    id: params.id,
    capacityMins: Math.max(0, params.capacityMins),
    urgency: params.urgency,
    protectFromCarry: params.protectFromCarry,
    fit: params.fit?.fit ?? null,
    orderIndex: params.orderIndex,
    text: params.text,
  };
}
