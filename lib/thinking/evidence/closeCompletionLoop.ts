// lib/thinking/evidence/closeCompletionLoop.ts
//
// Ambient reality — single entry for "something finished in life → train Dokkit".
//
// Surfaces call this after a successful DB write (or with the minutes they
// will persist). Fire-and-forget for prediction_log; never blocks the UI.
//
// Rules (philosophy-aligned):
// - Reliable timer time trains duration memory.
// - Zero-tap Done without structure does NOT train (no poison zeros).
// - Lifecycle soft mins may train when structure implies substance.
// - Carry / skip outcomes are not passed here (they are not duration evidence).

import {
  suggestEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import {
  resolveActualForLearning,
  type LifecycleHints,
} from '@/lib/thinking/durationQuality';
import { logCompletionOutcome } from './predictionLog';

export type CloseCompletionLoopParams = {
  userId: string | null | undefined;
  taskText: string;
  estimateMins: number;
  /**
   * Observed minutes when known (timer bank, explicit reshape actual).
   * Prefer this over estimate fallbacks.
   */
  actualMins?: number;
  /** Alias for actualMins — timer/logged total at completion. */
  measuredMins?: number;
  history: HistoricalTask[];
  clusters: TaskCluster[];
  /** Lifecycle signals when the timer is empty or weak. */
  hints?: LifecycleHints;
};

export type CloseCompletionLoopResult = {
  /** Safe to persist on tasks.actual_mins (0 if nothing trustworthy). */
  actualForDb: number;
  /** Minutes written to prediction_log / history; null = do not train. */
  trainMins: number | null;
  source: 'measured' | 'lifecycle' | 'none';
};

/**
 * Resolve what happened and, when trustworthy, close the prediction loop.
 * Safe from Today, Jobs, Reality Check, Travel stops, and post-stop prompt.
 */
export function closeCompletionLoop(
  params: CloseCompletionLoopParams
): CloseCompletionLoopResult {
  const measured = Math.round(
    params.measuredMins ?? params.actualMins ?? 0
  );

  const hints: LifecycleHints = {
    estimateMins: params.estimateMins,
    loggedMins: measured > 0 ? measured : params.hints?.loggedMins,
    jobId: params.hints?.jobId,
    dueToday: params.hints?.dueToday,
    intendedTime: params.hints?.intendedTime,
    createdAt: params.hints?.createdAt,
    completedAt: params.hints?.completedAt ?? new Date().toISOString(),
    surfaceDate: params.hints?.surfaceDate,
    subtaskCount: params.hints?.subtaskCount,
    sameDayRate: params.hints?.sameDayRate,
    jobRate: params.hints?.jobRate,
  };

  const resolved = resolveActualForLearning({
    measuredMins: measured,
    hints,
  });

  const trainMins = resolved.actualMins;
  const actualForDb =
    trainMins != null
      ? trainMins
      : measured > 0
        ? measured
        : 0;

  const userId = params.userId;
  const text = (params.taskText || '').trim();

  if (userId && text && trainMins != null && trainMins > 0) {
    const suggestion = suggestEstimate(
      text,
      params.history,
      params.clusters
    );

    logCompletionOutcome({
      userId,
      taskText: text,
      clusterLabel: suggestion?.matchedLabel ?? null,
      clusterCount: suggestion?.sampleCount ?? 0,
      estimatedMins: params.estimateMins || 0,
      suggestedMins: suggestion?.suggestedMins ?? null,
      confidence: suggestion?.confidence ?? 'low',
      actualMins: trainMins,
    }).catch(() => {
      // Evidence is best-effort; never surface failures to the user.
    });
  }

  return {
    actualForDb,
    trainMins,
    source: resolved.source,
  };
}

/**
 * History row for in-memory clusters — only when trainMins is set.
 */
export function historyRowFromCompletion(
  task: {
    text: string;
    location_text?: string | null;
    lat?: number | null;
    lng?: number | null;
    job_id?: string | null;
    created_at?: string;
    estimate_mins?: number;
    due_today?: boolean;
    surface_date?: string | null;
    source?: string | null;
    intended_time?: string | null;
  },
  trainMins: number,
  loggedMins: number,
  extra?: { subtask_count?: number }
): HistoricalTask {
  return {
    text: task.text,
    actual_mins: trainMins,
    location_text: task.location_text ?? null,
    lat: task.lat ?? null,
    lng: task.lng ?? null,
    job_id: task.job_id ?? null,
    created_at: task.created_at,
    completed_at: new Date().toISOString(),
    estimate_mins: task.estimate_mins,
    logged_mins: loggedMins,
    due_today: task.due_today,
    surface_date: task.surface_date,
    source: task.source as HistoricalTask['source'],
    intended_time: task.intended_time,
    subtask_count: extra?.subtask_count,
  };
}
