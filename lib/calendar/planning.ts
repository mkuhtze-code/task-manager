import type { CommitmentInterval } from '@/lib/calendar/types';

export interface AvailabilityInput {
  now: Date;
  workStartMins: number;
  workEndMins: number;
  isWorkDay: boolean;
  commitments: CommitmentInterval[];
}

export interface AvailabilityResult {
  availableMinutes: number;
  blockedMinutes: number;
}

export function isCommitmentActive(
  commitment: CommitmentInterval,
  now: Date
): boolean {
  return commitment.end.getTime() > now.getTime();
}

export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  if (!input.isWorkDay) {
    return { availableMinutes: 0, blockedMinutes: 0 };
  }
  const nowMins = input.now.getHours() * 60 + input.now.getMinutes();
  const workEndMins = input.workEndMins;
  if (nowMins >= workEndMins) {
    return { availableMinutes: 0, blockedMinutes: 0 };
  }

  const horizonStartMs = input.now.getTime();
  const horizonEndMs = horizonStartMs - (nowMins - workEndMins) * 60000;

  const intervals: Array<{ start: number; end: number }> = [];
  for (const c of input.commitments) {
    const cs = Math.max(c.start.getTime(), horizonStartMs);
    const ce = Math.min(c.end.getTime(), horizonEndMs);
    if (ce > cs) {
      intervals.push({ start: cs, end: ce });
    }
  }
  intervals.sort((a, b) => a.start - b.start);

  let blockedMs = 0;
  let mergedEnd = -Infinity;
  for (const iv of intervals) {
    const start = Math.max(iv.start, mergedEnd);
    if (iv.end > start) {
      blockedMs += iv.end - start;
      mergedEnd = iv.end;
    }
  }

  const horizonMs = horizonEndMs - horizonStartMs;
  return {
    availableMinutes: Math.round((horizonMs - blockedMs) / 60000),
    blockedMinutes: Math.round(blockedMs / 60000),
  };
}

export function mergeCommitmentIntervals(
  commitments: CommitmentInterval[]
): CommitmentInterval[] {
  const sorted = commitments
    .map((c) => ({
      start: c.start.getTime(),
      end: c.end.getTime(),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  const merged: CommitmentInterval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), iv.end));
    } else {
      merged.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return merged;
}

/**
 * Minutes until the next commitment *starts* (not currently in progress).
 * Returns null when none remain after now.
 */
export function minsToNextCommitment(
  now: Date,
  commitments: CommitmentInterval[]
): number | null {
  const nowMs = now.getTime();
  let best: number | null = null;
  for (const c of commitments) {
    if (c.end.getTime() <= nowMs) continue;
    if (c.start.getTime() <= nowMs) continue;
    const mins = Math.round((c.start.getTime() - nowMs) / 60000);
    if (mins < 0) continue;
    if (best == null || mins < best) best = mins;
  }
  return best;
}

/**
 * Share of remaining work window blocked by commitments (0–1).
 */
export function meetingDensityInWindow(
  now: Date,
  workEndMins: number,
  commitments: CommitmentInterval[]
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
 * Unify calendar events and timed manual meetings into commitment intervals.
 * Untimed meetings are excluded (they are flat capacity subtractors elsewhere).
 * Outlook-sourced meeting rows are excluded when calendar_events already
 * represent the same blocks.
 */
export function buildDayCommitments(params: {
  calendarEvents?: Array<{ start_at: string; end_at: string }>;
  meetings?: Array<{
    start_time: string | null;
    duration_mins: number;
    source?: string | null;
  }>;
}): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  for (const e of params.calendarEvents ?? []) {
    const start = new Date(e.start_at);
    const end = new Date(e.end_at);
    if (end.getTime() > start.getTime()) out.push({ start, end });
  }
  for (const m of params.meetings ?? []) {
    if (m.source === 'outlook') continue;
    if (!m.start_time) continue;
    if (!(m.duration_mins > 0)) continue;
    const start = new Date(m.start_time);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + m.duration_mins * 60000);
    out.push({ start, end });
  }
  return out;
}

/**
 * Remaining task capacity for the rest of the workday after commitments.
 */
export function remainingTaskCapacityMins(params: {
  now: Date;
  workStartMins: number;
  workEndMins: number;
  isWorkDay: boolean;
  commitments: Array<{ start: Date; end: Date }>;
  /** Flat subtractors (e.g. untimed manual meetings total mins). */
  flatBlockedMins?: number;
}): number {
  const availability = computeAvailability({
    now: params.now,
    workStartMins: params.workStartMins,
    workEndMins: params.workEndMins,
    isWorkDay: params.isWorkDay,
    commitments: params.commitments,
  });
  const flat = Math.max(0, params.flatBlockedMins ?? 0);
  return Math.max(0, availability.availableMinutes - flat);
}
