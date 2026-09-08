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