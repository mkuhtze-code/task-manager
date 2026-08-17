// lib/thinking/confidence.ts
//
// Deterministic confidence calibration. The same discipline as the rest
// of the thinking engine: pure functions, no randomness, no external
// state. Confidence is a function of sample count alone — enough data
// to trust the signal, not enough to trust it blindly.

import type { Confidence } from './types';

// Blend weights per confidence level. Higher confidence → more weight
// given to the learned average, less to the typed estimate. These are
// the core tuning knobs for how aggressively the engine overrides
// human-typed estimates.
export const BLEND_WEIGHTS: Record<Confidence, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

// Thresholds for classifying cluster size into confidence levels.
// Chosen to match the existing taskIntelligence.ts behavior so the
// migration is seamless.
export const CONFIDENCE_THRESHOLDS = {
  medium: 4,
  high: 7,
} as const;

// Classify a sample count into a confidence level.
export function classifyConfidence(sampleCount: number): Confidence {
  if (sampleCount >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (sampleCount >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

// Is this cluster large enough to warrant any blending at all?
// Below this threshold, the learned data is too thin to override
// human judgment.
export const MIN_SAMPLES_FOR_BLENDING = 2;
