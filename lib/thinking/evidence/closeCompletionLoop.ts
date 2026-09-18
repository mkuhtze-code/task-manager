// lib/thinking/evidence/closeCompletionLoop.ts
//
// Single entry point for "task is done → feed the thinking engine".
// Surfaces should call this after a successful DB update so capture,
// capacity, and Patterns share the same evidence path.
//
// Fire-and-forget: never blocks the UI. Skips when there is no usable
// actual duration (avoids poisoning calibration with zero-minute no-ops).

import {
  suggestEstimate,
  type HistoricalTask,
  type TaskCluster,
} from '@/lib/taskIntelligence';
import { logCompletionOutcome } from './predictionLog';

export type CloseCompletionLoopParams = {
  userId: string | null | undefined;
  taskText: string;
  estimateMins: number;
  /** Observed minutes (timer, explicit actual, or honest fallback). */
  actualMins: number;
  history: HistoricalTask[];
  clusters: TaskCluster[];
};

/**
 * Record estimate vs actual for the learning loop.
 * Safe to call from any complete path; no-ops when evidence is weak.
 */
export function closeCompletionLoop(params: CloseCompletionLoopParams): void {
  const userId = params.userId;
  if (!userId) return;

  const actual = Math.round(params.actualMins);
  if (!Number.isFinite(actual) || actual <= 0) return;

  const text = (params.taskText || '').trim();
  if (!text) return;

  const suggestion = suggestEstimate(text, params.history, params.clusters);

  logCompletionOutcome({
    userId,
    taskText: text,
    clusterLabel: suggestion?.matchedLabel ?? null,
    clusterCount: suggestion?.sampleCount ?? 0,
    estimatedMins: params.estimateMins || 0,
    suggestedMins: suggestion?.suggestedMins ?? null,
    confidence: suggestion?.confidence ?? 'low',
    actualMins: actual,
  }).catch(() => {
    // Evidence is best-effort; never surface failures to the user.
  });
}
