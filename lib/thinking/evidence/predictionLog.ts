// lib/thinking/evidence/predictionLog.ts
//
// Ties together the observation → evidence → persistence pipeline.
//
// Phase 2: predictions link primarily by task_id (and prediction id).
// task_text remains context only — never the primary identity for closure.

import type { PredictionLogEntry, Confidence } from '../types';
import { observeEstimateAccuracy } from '../observations/estimateAccuracy';
import {
  logPrediction,
  recordOutcome,
  persistPrediction,
  resolveOpenPrediction,
} from '../evidence';
import {
  MODEL_VERSION,
  ALGORITHM_VERSION,
  FEATURE_VERSION,
} from '../v3/types';

// ── Log at capture time ───────────────────────────────────────────

export async function logCapturePrediction(params: {
  userId: string;
  /** Stable task id after insert — required for reliable closure. */
  taskId?: string | null;
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
  modelVersion?: string;
  algorithmVersion?: string;
  featureVersion?: string;
  decisionId?: string | null;
}): Promise<PredictionLogEntry | null> {
  const entry = logPrediction({
    user_id: params.userId,
    task_id: params.taskId ?? null,
    task_text: params.taskText,
    cluster_label: params.clusterLabel,
    cluster_count: params.clusterCount,
    estimated_mins: params.estimatedMins,
    suggested_mins: params.suggestedMins,
    confidence: params.confidence,
    actual_mins: null,
    completed_at: null,
    outcome_kind: null,
    model_version: params.modelVersion ?? MODEL_VERSION,
    algorithm_version: params.algorithmVersion ?? ALGORITHM_VERSION,
    feature_version: params.featureVersion ?? FEATURE_VERSION,
    decision_id: params.decisionId ?? null,
  });

  return persistPrediction(entry);
}

// ── Log at completion time ────────────────────────────────────────

export async function logCompletionOutcome(params: {
  userId: string;
  taskId?: string | null;
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
  actualMins: number;
  outcomeKind?: PredictionLogEntry['outcome_kind'];
  modelVersion?: string;
  algorithmVersion?: string;
  featureVersion?: string;
}): Promise<{
  observation: ReturnType<typeof observeEstimateAccuracy>;
  prediction: PredictionLogEntry | null;
}> {
  const observation = observeEstimateAccuracy(params);

  recordOutcome({
    taskId: params.taskId ?? null,
    taskText: params.taskText,
    actualMins: params.actualMins,
    outcomeKind: params.outcomeKind ?? 'done',
  });

  const resolved = await resolveOpenPrediction({
    userId: params.userId,
    taskId: params.taskId ?? null,
    taskText: params.taskText,
    actualMins: params.actualMins,
    outcomeKind: params.outcomeKind ?? 'done',
  });

  if (resolved) {
    return { observation, prediction: resolved };
  }

  const prediction = await persistPrediction({
    user_id: params.userId,
    task_id: params.taskId ?? null,
    task_text: params.taskText,
    cluster_label: params.clusterLabel,
    cluster_count: params.clusterCount,
    estimated_mins: params.estimatedMins,
    suggested_mins: params.suggestedMins,
    confidence: params.confidence,
    actual_mins: params.actualMins,
    completed_at: new Date().toISOString(),
    outcome_kind: params.outcomeKind ?? 'done',
    model_version: params.modelVersion ?? MODEL_VERSION,
    algorithm_version: params.algorithmVersion ?? ALGORITHM_VERSION,
    feature_version: params.featureVersion ?? FEATURE_VERSION,
    decision_id: null,
  });

  return { observation, prediction };
}
