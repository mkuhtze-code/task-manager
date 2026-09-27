// lib/thinking/evidence/closeCompletionLoop.ts
//
// Ambient reality — single entry for "something finished in life → train Dokkit".
//
// Phase 2: pass taskId so prediction closure is identity-based, not text-matched.

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
import type { PredictionLogEntry } from '../types';

export type CloseCompletionLoopParams = {
  userId: string | null | undefined;
  /** Stable task identity — preferred over taskText for prediction linkage. */
  taskId?: string | null;
  taskText: string;
  estimateMins: number;
  actualMins?: number;
  measuredMins?: number;
  history: HistoricalTask[];
  clusters: TaskCluster[];
  hints?: LifecycleHints;
  /** Defaults to done. Partial/carry/skip inform different dimensions. */
  outcomeKind?: PredictionLogEntry['outcome_kind'];
};

export type CloseCompletionLoopResult = {
  actualForDb: number;
  trainMins: number | null;
  source: 'measured' | 'lifecycle' | 'none';
};

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
  const outcomeKind = params.outcomeKind ?? 'done';

  // Duration training only for outcomes that legitimately inform duration.
  const mayTrainDuration =
    outcomeKind === 'done' ||
    outcomeKind === 'partial' ||
    outcomeKind === null ||
    outcomeKind === undefined;

  if (userId && text && trainMins != null && trainMins > 0 && mayTrainDuration) {
    const suggestion = suggestEstimate(
      text,
      params.history,
      params.clusters
    );

    logCompletionOutcome({
      userId,
      taskId: params.taskId ?? null,
      taskText: text,
      clusterLabel: suggestion?.matchedLabel ?? null,
      clusterCount: suggestion?.sampleCount ?? 0,
      estimatedMins: params.estimateMins || 0,
      suggestedMins: suggestion?.suggestedMins ?? null,
      confidence: suggestion?.confidence ?? 'low',
      actualMins: trainMins,
      outcomeKind,
    }).catch(() => {});
  }

  return {
    actualForDb,
    trainMins: mayTrainDuration ? trainMins : null,
    source: mayTrainDuration ? resolved.source : 'none',
  };
}

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
