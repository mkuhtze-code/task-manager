/**
 * Reality Capture — types and pure helpers for the end-of-day reshape loop.
 * Deterministic, no AI. Aligns with docs/reality-capture.md.
 */

import type { Task } from '@/lib/taskTypes';

export type RealityOutcome = 'done' | 'partial' | 'carried' | 'skipped';

export type RealityUpdate = {
  taskId: string;
  outcome: RealityOutcome;
  actualMins?: number | null;
  remainingMins?: number | null;
  note?: string | null;
};

export type ReshapeSummary = {
  doneCount: number;
  carriedCount: number;
  skippedCount: number;
  message: string;
};

/** Next calendar day as YYYY-MM-DD in local time. */
export function nextCalendarDate(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Next valid work day after `from`, respecting workDays (0=Sun … 6=Sat).
 * Falls back to next calendar day if workDays is empty.
 */
export function nextWorkSurfaceDate(
  from: Date = new Date(),
  workDays: number[] = [1, 2, 3, 4, 5]
): string {
  if (!workDays.length) return nextCalendarDate(from);
  let d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  for (let i = 0; i < 14; i++) {
    if (workDays.includes(d.getDay())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    d.setDate(d.getDate() + 1);
  }
  return nextCalendarDate(from);
}

export function summarizeReshape(updates: RealityUpdate[]): ReshapeSummary {
  const doneCount = updates.filter((u) => u.outcome === 'done').length;
  const carriedCount = updates.filter(
    (u) => u.outcome === 'carried' || u.outcome === 'partial'
  ).length;
  const skippedCount = updates.filter((u) => u.outcome === 'skipped').length;
  const parts: string[] = ['Plan updated.'];
  if (doneCount > 0) parts.push(`${doneCount} done.`);
  if (carriedCount > 0) parts.push(`${carriedCount} carried forward.`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped.`);
  return { doneCount, carriedCount, skippedCount, message: parts.join(' ') };
}

/** Tasks that belong on Today's list for a Reality Check (not already done). */
export function tasksForRealityCheck(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status !== 'done');
}
