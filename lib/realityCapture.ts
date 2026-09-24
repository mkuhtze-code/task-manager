/**
 * Reality Capture — types and pure helpers for the end-of-day reshape loop.
 * Deterministic, no AI. Aligns with docs/reality-capture.md.
 *
 * Scope: reality teaches the plan
 * - Done / Partial observations feed history (Carry / Skip do not)
 * - Zero-minute "done" without a timer does not train duration memory
 * - A calm morning line surfaces yesterday’s reshape without homework
 */

import type { Task } from '@/lib/taskTypes';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import {
  isReliableActualMins,
  resolveActualForLearning,
} from '@/lib/thinking/durationQuality';

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

/** Snapshot stored after Reshape so the next morning can speak calmly. */
export type DayCloseRecord = {
  /** Local calendar day the reshape ran (YYYY-MM-DD). */
  date: string;
  doneCount: number;
  carriedCount: number;
  skippedCount: number;
  message: string;
};

const DAY_CLOSE_KEY = 'dokkit-last-day-close';
const MORNING_SHOWN_KEY = 'dokkit-morning-shown-for';

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

/**
 * Live minutes already spent on a task (logged + active session).
 * Used so Partial can record total observed duration = spent + remaining.
 */
export function spentMinsNow(task: Task, nowMs: number = Date.now()): number {
  let spent = task.logged_mins || 0;
  if (task.status === 'active' && task.started_at) {
    spent += (nowMs - new Date(task.started_at).getTime()) / 60000;
  }
  return Math.max(0, spent);
}

function subtaskCountFromUnknown(task: Task): number | null {
  // Callers may attach a transient count; Task type does not require it.
  const any = task as Task & { subtask_count?: number };
  return typeof any.subtask_count === 'number' ? any.subtask_count : null;
}

/**
 * Turn one Reality Update into a history observation when reality was measured.
 * - Done → reliable actual, or lifecycle soft if structure exists; never train 0
 * - Partial → spent + remaining (total work this kind of task took)
 * - Carry / Skip → null (must not poison learning)
 */
export function historyObservationForUpdate(
  task: Task,
  update: RealityUpdate,
  nowMs: number = Date.now()
): HistoricalTask | null {
  if (update.outcome === 'done') {
    const spent = spentMinsNow(task, nowMs);
    const chipOrSpent =
      update.actualMins != null && update.actualMins > 0
        ? update.actualMins
        : Math.round(spent);

    const resolved = resolveActualForLearning({
      measuredMins: chipOrSpent,
      hints: {
        estimateMins: task.estimate_mins,
        loggedMins: spent,
        jobId: task.job_id,
        dueToday: task.due_today,
        intendedTime: task.intended_time,
        createdAt: task.created_at,
        completedAt: new Date(nowMs).toISOString(),
        surfaceDate: task.surface_date,
        subtaskCount: subtaskCountFromUnknown(task),
      },
    });

    if (resolved.actualMins == null) return null;

    return {
      text: task.text,
      actual_mins: resolved.actualMins,
      location_text: task.location_text,
      lat: task.lat,
      lng: task.lng,
      job_id: task.job_id,
      created_at: task.created_at,
      completed_at: new Date(nowMs).toISOString(),
      estimate_mins: task.estimate_mins,
      logged_mins: Math.round(spent),
      due_today: task.due_today,
      surface_date: task.surface_date,
      intended_time: task.intended_time,
      subtask_count: subtaskCountFromUnknown(task),
    };
  }

  if (update.outcome === 'partial') {
    const spent = Math.round(spentMinsNow(task, nowMs));
    const remaining =
      update.remainingMins != null && update.remainingMins > 0
        ? update.remainingMins
        : Math.max(5, Math.round(task.estimate_mins / 2));
    const total = Math.max(spent + remaining, remaining);

    // Partial always implies real work remained — accept even if spent was 0.
    if (!isReliableActualMins(total) && total < 5) return null;

    return {
      text: task.text,
      actual_mins: total,
      location_text: task.location_text,
      lat: task.lat,
      lng: task.lng,
      job_id: task.job_id,
      created_at: task.created_at,
      completed_at: new Date(nowMs).toISOString(),
      estimate_mins: task.estimate_mins,
      logged_mins: spent,
      due_today: task.due_today,
      surface_date: task.surface_date,
      intended_time: task.intended_time,
      subtask_count: subtaskCountFromUnknown(task),
    };
  }

  return null;
}

/** Persist last reshape so tomorrow morning can surface a calm line. */
export function saveDayClose(record: DayCloseRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DAY_CLOSE_KEY, JSON.stringify(record));
    // Closing the day retires any soft invite for that date.
    clearPendingRealityInvite(record.date);
  } catch {
    // ignore quota / private mode
  }
}

export function readDayClose(): DayCloseRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DAY_CLOSE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DayCloseRecord;
    if (!parsed || typeof parsed.date !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Calm morning line from yesterday’s reshape.
 * Shown once per calendar day, only when the close was on a prior day.
 * Empty string means nothing to show (same day, or already shown).
 */
export function consumeMorningPlanMessage(todayStr: string): string | null {
  if (typeof window === 'undefined') return null;
  const close = readDayClose();
  if (!close) return null;
  if (close.date >= todayStr) return null;

  try {
    if (window.localStorage.getItem(MORNING_SHOWN_KEY) === todayStr) return null;
    window.localStorage.setItem(MORNING_SHOWN_KEY, todayStr);
  } catch {
    // still return message even if we can't mark shown
  }

  const parts: string[] = [];
  if (close.carriedCount > 0) {
    parts.push(
      close.carriedCount === 1
        ? '1 thing carried from yesterday.'
        : `${close.carriedCount} things carried from yesterday.`
    );
  }
  if (close.doneCount > 0 && close.carriedCount === 0) {
    parts.push('Yesterday’s plan was closed out.');
  }
  if (parts.length === 0) {
    parts.push('Plan is ready for today.');
  } else {
    parts.push('Capacity uses what this work usually takes.');
  }
  return parts.join(' ');
}


// ── Soft Reality Check invite (never enforced) ─────────────────────
// If the day ends with work still on the plate and the person never
// ran Reality Check, the *next* morning can show a dismissible card.
// Opening the sheet is always optional. Nothing is demanded.

const PENDING_REALITY_KEY = 'dokkit-pending-reality-invite';
const PENDING_DISMISSED_PREFIX = 'dokkit-pending-reality-dismissed:';

export type PendingRealityInvite = {
  /** Local calendar day that still had open work without a day-close. */
  forDate: string;
  taskCount: number;
};

/**
 * Note that this day still has open work during the soft Reality Check window.
 * Does not open UI. Overwrites only for the same forDate.
 */
export function noteOpenRealityWindow(forDate: string, taskCount: number): void {
  if (typeof window === 'undefined') return;
  if (taskCount <= 0) return;
  const close = readDayClose();
  if (close && close.date === forDate) return;
  try {
    if (window.localStorage.getItem(PENDING_DISMISSED_PREFIX + forDate) === '1') {
      return;
    }
    const payload: PendingRealityInvite = { forDate, taskCount };
    window.localStorage.setItem(PENDING_REALITY_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearPendingRealityInvite(forDate?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PENDING_REALITY_KEY);
    if (!raw) return;
    if (forDate) {
      const parsed = JSON.parse(raw) as PendingRealityInvite;
      if (parsed?.forDate !== forDate) return;
    }
    window.localStorage.removeItem(PENDING_REALITY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Next-morning invite: prior day had open work and no day-close.
 * Does not mark as shown — caller dismisses or completes reshape.
 * Returns null if already dismissed or not applicable.
 */
export function readPendingRealityInvite(todayStr: string): PendingRealityInvite | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_REALITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingRealityInvite;
    if (!parsed?.forDate || parsed.forDate >= todayStr) return null;
    if (window.localStorage.getItem(PENDING_DISMISSED_PREFIX + parsed.forDate) === '1') {
      return null;
    }
    // If they did close that day after the note was written, retire it.
    const close = readDayClose();
    if (close && close.date === parsed.forDate) {
      window.localStorage.removeItem(PENDING_REALITY_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** User chose "Not now" — never force this invite again for that day. */
export function dismissPendingRealityInvite(forDate: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_DISMISSED_PREFIX + forDate, '1');
    clearPendingRealityInvite(forDate);
  } catch {
    // ignore
  }
}
