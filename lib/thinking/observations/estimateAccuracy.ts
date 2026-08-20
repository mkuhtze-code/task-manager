// lib/thinking/observations/estimateAccuracy.ts
//
// Observation: how accurate was this estimate compared to reality?
// Fires when a task completes and the engine knows both the predicted
// and actual durations. Produces a single EstimateAccuracyObservation
// that the evidence system logs and the Patterns surface can display.

import type {
  EstimateAccuracyObservation,
  Confidence,
} from '../types';
import { classifyConfidence } from '../confidence';

// Re-export types so consumers can import them from this module.
export type { EstimateAccuracyObservation, Confidence } from '../types';

export function observeEstimateAccuracy(params: {
  taskText: string;
  clusterLabel: string | null;
  clusterCount: number;
  estimatedMins: number;
  actualMins: number;
}): EstimateAccuracyObservation {
  const { taskText, clusterLabel, clusterCount, estimatedMins, actualMins } = params;
  const ratio = actualMins / Math.max(estimatedMins, 1);
  const confidence = classifyConfidence(clusterCount);

  return {
    kind: 'estimate_accuracy',
    taskText,
    clusterLabel,
    clusterCount,
    estimatedMins,
    actualMins,
    ratio,
    confidence,
    observedAt: new Date().toISOString(),
  };
}

// ── Accuracy classification ───────────────────────────────────────
// Is this ratio "close enough"? Thresholds chosen to match the
// existing hasMeaningfulDivergence behavior in taskIntelligence.ts.

export function classifyAccuracy(
  estimatedMins: number,
  actualMins: number
): 'accurate' | 'over' | 'under' {
  const diff = Math.abs(actualMins - estimatedMins);
  if (diff < 5 || diff / Math.max(estimatedMins, 1) < 0.15) {
    return 'accurate';
  }
  return actualMins > estimatedMins ? 'over' : 'under';
}

// ── Accuracy summary from a batch of observations ─────────────────

export function summarizeAccuracy(observations: EstimateAccuracyObservation[]): {
  total: number;
  averageRatio: number;
  accuracyPercent: number;
  medianRatio: number;
} {
  if (observations.length === 0) {
    return { total: 0, averageRatio: 1, accuracyPercent: 100, medianRatio: 1 };
  }

  const ratios = observations.map((o) => o.ratio);
  const sum = ratios.reduce((a, b) => a + b, 0);
  const averageRatio = sum / ratios.length;

  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianRatio =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  // "Accuracy percent" = how close the average ratio is to 1.0 (100%)
  const accuracyPercent = Math.round(
    Math.min(100, (1 / Math.max(averageRatio, 0.01)) * 100)
  );

  return { total: observations.length, averageRatio, accuracyPercent, medianRatio };
}
