// lib/thinking/evidence/closeCompletionLoop.ts
//
// Ambient reality — single entry for "something finished in life → train Dokkit".
//
// Phase 2: taskId for identity-based prediction linkage.
// Phase 5.5: WorkEpisode gates duration training when interruption contaminates.
// FP-0: Outcome channels — only clean_done trains duration; partial/carry/skip do not.

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
import {
  classifyOutcomeChannel,
  type OutcomeChannelResult,
  type RealityOutcomeLike,
  type TrainingChannel,
} from '@/lib/thinking/v3/outcomeChannels';
import { logCompletionOutcome } from './predictionLog';
import type { PredictionLogEntry } from '../types';

export type CloseCompletionLoopParams = {
  userId: string | null | undefined;
  /**
   * Stable task identity — required for reliable prediction linkage (FP-0).
   * When missing, duration may still resolve for DB but prediction close is weak.
   */
  taskId?: string | null;
  taskText: string;
  estimateMins: number;
  actualMins?: number;
  measuredMins?: number;
  history: HistoricalTask[];
  clusters: TaskCluster[];
  hints?: LifecycleHints;
  /** Defaults to done. Prefer realityOutcome when from Reality Check. */
  outcomeKind?: PredictionLogEntry['outcome_kind'];
  /** Reality Check outcome when known (FP-0). */
  realityOutcome?: RealityOutcomeLike | null;
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
  /** True when interruption/waiting/channel blocked duration learning. */
  durationTrainingBlocked?: boolean;
  /** FP-0 channel classification. */
  channel?: TrainingChannel;
  channelReasons?: string[];
};

function episodeOutcomeFromKind(
  kind: PredictionLogEntry['outcome_kind'] | undefined,
  reality: RealityOutcomeLike | null | undefined
): 'done' | 'partial' | 'carry' | 'skip' | 'unknown' {
  if (reality === 'partial') return 'partial';
  if (reality === 'carried') return 'carry';
  if (reality === 'skipped') return 'skip';
  if (kind === 'done' || kind === 'partial' || kind === 'carry' || kind === 'skip') {
    return kind;
  }
  if (reality === 'done') return 'done';
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

  const taskId = params.taskId?.trim() || null;
  const userId = params.userId;
  const realityOutcome = params.realityOutcome ?? null;

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
      outcome: episodeOutcomeFromKind(params.outcomeKind, realityOutcome),
      legacyActualMins: measured > 0 ? measured : null,
    });

    const epTrain = trainMinutesFromEpisode(episode);
    if (episode.durationEvidence === 'contaminated') {
      durationTrainingBlocked = true;
      if (source === 'measured') {
        trainMins = null;
        source = 'none';
      }
    } else if (epTrain != null && source === 'measured') {
      trainMins = epTrain;
    }
  }

  // FP-0 — channel classification (partial/carry/skip/interrupt never train duration).
  const channelResult: OutcomeChannelResult = classifyOutcomeChannel({
    realityOutcome,
    outcomeKind: params.outcomeKind ?? episode?.outcome ?? null,
    durationEvidence: episode?.durationEvidence ?? null,
    interruptionMinutes:
      params.interruptionMinutes ?? episode?.interruptionMinutes ?? null,
    waitingMinutes: params.waitingMinutes ?? episode?.waitingMinutes ?? null,
    measuredMins: trainMins ?? measured,
    hasTaskId: Boolean(taskId),
  });

  if (!channelResult.mayTrainDuration) {
    durationTrainingBlocked = true;
    trainMins = null;
    source = 'none';
  }

  const actualForDb =
    channelResult.mayTrainDuration && trainMins != null
      ? trainMins
      : measured > 0
        ? measured
        : 0;

  const text = (params.taskText || '').trim();
  const logKind = channelResult.logOutcomeKind ?? params.outcomeKind ?? 'done';

  // Duration prediction close only on clean_done with train minutes.
  if (
    userId &&
    text &&
    trainMins != null &&
    trainMins > 0 &&
    channelResult.mayTrainDuration
  ) {
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
      outcomeKind: logKind ?? 'done',
    }).catch(() => {});
  }

  return {
    actualForDb,
    trainMins: channelResult.mayTrainDuration ? trainMins : null,
    source: channelResult.mayTrainDuration ? source : 'none',
    episode,
    durationTrainingBlocked,
    channel: channelResult.channel,
    channelReasons: channelResult.reasons,
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
