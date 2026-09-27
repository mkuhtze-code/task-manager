// lib/thinking/evidence/closeCompletionLoop.ts
//
// Ambient reality — single entry for "something finished in life → train Dokkit".
//
// Phase 2: taskId for identity-based prediction linkage.
// Phase 5.5: WorkEpisode gates duration training when interruption contaminates.

import {
  suggestEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import {
  resolveActualForLearning,
  type LifecycleHints,
} from '@/lib/thinking/durationQuality';
import {
  buildWorkEpisode,
  trainMinutesFromEpisode,
  type WorkEpisode,
} from '@/lib/thinking/v3/episodes';
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
  /**
   * Optional episode signals (Phase 5.5).
   * When interruption dominates, duration training is suppressed.
   */
  startedAt?: string | null;
  completedAt?: string | null;
  /** Explicit active/focused minutes when known (timer). */
  activeMinutes?: number | null;
  interruptionMinutes?: number | null;
  waitingMinutes?: number | null;
};

export type CloseCompletionLoopResult = {
  actualForDb: number;
  trainMins: number | null;
  source: 'measured' | 'lifecycle' | 'none';
  /** Episode used for training gate, when built. */
  episode?: WorkEpisode | null;
  /** True when interruption/waiting blocked duration learning. */
  durationTrainingBlocked?: boolean;
};

function episodeOutcomeFromKind(
  kind: PredictionLogEntry['outcome_kind'] | undefined
): 'done' | 'partial' | 'carry' | 'skip' | 'unknown' {
  if (kind === 'done' || kind === 'partial' || kind === 'carry' || kind === 'skip') {
    return kind;
  }
  return 'unknown';
}

export function closeCompletionLoop(
  params: CloseCompletionLoopParams
): CloseCompletionLoopResult {
  const measured = Math.round(
    params.measuredMins ?? params.actualMins ?? 0
  );

  const completedAt =
    params.completedAt ??
    params.hints?.completedAt ??
    new Date().toISOString();

  const hints: LifecycleHints = {
    estimateMins: params.estimateMins,
    loggedMins: measured > 0 ? measured : params.hints?.loggedMins,
    jobId: params.hints?.jobId,
    dueToday: params.hints?.dueToday,
    intendedTime: params.hints?.intendedTime,
    createdAt: params.hints?.createdAt,
    completedAt,
    surfaceDate: params.hints?.surfaceDate,
    subtaskCount: params.hints?.subtaskCount,
    sameDayRate: params.hints?.sameDayRate,
    jobRate: params.hints?.jobRate,
  };

  const resolved = resolveActualForLearning({
    measuredMins: measured,
    hints,
  });

  let trainMins = resolved.actualMins;
  let source: CloseCompletionLoopResult['source'] = resolved.source;
  let durationTrainingBlocked = false;
  let episode: WorkEpisode | null = null;

  // Phase 5.5 — episode gate: do not train duration on contaminated elapsed.
  const taskId = params.taskId?.trim() || null;
  const userId = params.userId;
  if (userId && taskId) {
    episode = buildWorkEpisode({
      episodeId: `ep_${taskId}_${completedAt}`,
      taskId,
      userId,
      startedAt: params.startedAt ?? params.hints?.createdAt ?? null,
      endedAt: completedAt,
      activeMinutes: params.activeMinutes ?? null,
      interruptionMinutes: params.interruptionMinutes ?? null,
      waitingMinutes: params.waitingMinutes ?? null,
      jobId: params.hints?.jobId ?? null,
      outcome: episodeOutcomeFromKind(params.outcomeKind),
      legacyActualMins: measured > 0 ? measured : null,
    });

    const epTrain = trainMinutesFromEpisode(episode);
    if (episode.durationEvidence === 'contaminated') {
      durationTrainingBlocked = true;
      // Still allow lifecycle soft if measured was zero; never train contaminated elapsed.
      if (source === 'measured') {
        trainMins = null;
        source = 'none';
      }
    } else if (epTrain != null && source === 'measured') {
      // Prefer episode-safe train minutes (active when known).
      trainMins = epTrain;
    }
  }

  const actualForDb =
    trainMins != null
      ? trainMins
      : measured > 0
        ? measured
        : 0;

  const text = (params.taskText || '').trim();
  const outcomeKind = params.outcomeKind ?? 'done';

  const mayTrainDuration =
    (outcomeKind === 'done' ||
      outcomeKind === 'partial' ||
      outcomeKind === null ||
      outcomeKind === undefined) &&
    !durationTrainingBlocked;

  if (userId && text && trainMins != null && trainMins > 0 && mayTrainDuration) {
    const suggestion = suggestEstimate(
      text,
      params.history,
      params.clusters
    );

    logCompletionOutcome({
      userId,
      taskId: taskId,
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
    source: mayTrainDuration ? source : 'none',
    episode,
    durationTrainingBlocked,
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
