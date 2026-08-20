// lib/thinking/evidence/predictionLog.ts
//
// Ties together the observation → evidence → persistence pipeline.
// When a task completes, this module:
//   1. Observes the estimate accuracy.
//   2. Logs the prediction with its outcome.
//   3. Persists to Supabase.
//
// When a task is captured (before completion), this module:
//   1. Logs the prediction (what the engine thinks it'll take).
//   2. Persists to Supabase with null actual_mins.
//
// This is the only module in the thinking engine that touches
// Supabase — everything else is pure functions over data.

import type { PredictionLogEntry, Confidence } from '../types';
import { observeEstimateAccuracy } from '../observations/estimateAccuracy';
import {
  logPrediction,
  recordOutcome,
  persistPrediction,
  getBuffer,
} from '../evidence';

// ── Log at capture time ───────────────────────────────────────────
// Called when a task is captured (created). Logs what the engine
// predicted so it can be compared against the actual outcome later.

export async function logCapturePrediction(params: {
  userId: string;
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
}): Promise<PredictionLogEntry | null> {
  const entry = logPrediction({
    user_id: params.userId,
    task_text: params.taskText,
    cluster_label: params.clusterLabel,
    cluster_count: params.clusterCount,
    estimated_mins: params.estimatedMins,
    suggested_mins: params.suggestedMins,
    confidence: params.confidence,
    actual_mins: null,
    completed_at: null,
  });

  // Persist to Supabase for durable evidence.
  return persistPrediction(entry);
}

// ── Log at completion time ────────────────────────────────────────
// Called when a task completes. Observes the accuracy, records the
// outcome in the buffer, and persists the completed prediction.

export async function logCompletionOutcome(params: {
  userId: string;
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
  actualMins: number;
}): Promise<{
  observation: ReturnType<typeof observeEstimateAccuracy>;
  prediction: PredictionLogEntry | null;
}> {
  // Observe the accuracy.
  const observation = observeEstimateAccuracy(params);

  // Record outcome in the in-memory buffer.
  recordOutcome(params.taskText, params.actualMins);

  // Persist the completed prediction.
  const prediction = await persistPrediction({
    user_id: params.userId,
    task_text: params.taskText,
    cluster_label: params.clusterLabel,
    cluster_count: params.clusterCount,
    estimated_mins: params.estimatedMins,
    suggested_mins: params.suggestedMins,
    confidence: params.confidence,
    actual_mins: params.actualMins,
    completed_at: new Date().toISOString(),
  });

  return { observation, prediction };
}
