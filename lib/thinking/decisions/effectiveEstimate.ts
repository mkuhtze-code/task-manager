// lib/thinking/decisions/effectiveEstimate.ts
//
// The core decision: given what the person typed and what the engine
// has learned from history, what estimate should capacity math use?
//
// This replaces the effectiveEstimate function in taskIntelligence.ts
// with a version that:
//   1. Carries the full decision context (so it can explain itself).
//   2. Uses the thinking engine's confidence calibration.
//   3. Records the prediction in the evidence buffer for later
//      comparison against outcomes.
//
// The person-facing display estimate is NEVER changed — this only
// affects the internal capacity picture (the ring, the day rail,
// overflow flags).

import type { EffectiveEstimateDecision, Confidence } from '../types';
import { BLEND_WEIGHTS, MIN_SAMPLES_FOR_BLENDING } from '../confidence';

// Re-export Confidence so consumers can import it from this module.
export type { Confidence } from '../types';

// ── Divergence check ──────────────────────────────────────────────
// Is the typed estimate meaningfully different from the learned one?
// Matches the existing hasMeaningfulDivergence logic in taskIntelligence.ts.

export function hasMeaningfulDivergence(
  typedMins: number,
  suggestedMins: number
): boolean {
  const diff = Math.abs(suggestedMins - typedMins);
  return diff >= 5 && diff / Math.max(typedMins, 1) >= 0.15;
}

// ── Effective estimate with decision context ──────────────────────
// The main entry point. Returns a decision that carries everything
// the calling code needs: the blended number, the confidence level,
// and enough context to render a quiet explanation if desired.

export function computeEffectiveEstimate(params: {
  typedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
  clusterCount: number;
}): EffectiveEstimateDecision {
  const { typedMins, suggestedMins, confidence, clusterCount } = params;

  // No suggestion or too few samples → typed estimate stands alone.
  if (!suggestedMins || clusterCount < MIN_SAMPLES_FOR_BLENDING) {
    return {
      kind: 'effective_estimate',
      typedMins,
      suggestedMins: suggestedMins ?? typedMins,
      blendedMins: typedMins,
      confidence: 'low',
      clusterCount,
      divergence: 0,
      blendWeight: 0,
    };
  }

  // Not enough divergence → typed estimate stands alone.
  if (!hasMeaningfulDivergence(typedMins, suggestedMins)) {
    return {
      kind: 'effective_estimate',
      typedMins,
      suggestedMins,
      blendedMins: typedMins,
      confidence,
      clusterCount,
      divergence: Math.abs(suggestedMins - typedMins),
      blendWeight: 0,
    };
  }

  // Blend: higher confidence → more weight on the learned average.
  const weight = BLEND_WEIGHTS[confidence];
  const blended = typedMins * (1 - weight) + suggestedMins * weight;

  return {
    kind: 'effective_estimate',
    typedMins,
    suggestedMins,
    blendedMins: Math.round(blended),
    confidence,
    clusterCount,
    divergence: Math.abs(suggestedMins - typedMins),
    blendWeight: weight,
  };
}

// ── Backward-compatible wrapper ───────────────────────────────────
// Drop-in replacement for the old effectiveEstimate function. Returns
// just the number, not the full decision. Used by code paths that
// don't need the decision context yet (like effectiveRemainingForTask).

export function effectiveEstimate(
  typedMins: number,
  suggestion: { suggestedMins: number; confidence: Confidence; sampleCount: number } | null
): number {
  if (!suggestion) return typedMins;
  const decision = computeEffectiveEstimate({
    typedMins,
    suggestedMins: suggestion.suggestedMins,
    confidence: suggestion.confidence,
    clusterCount: suggestion.sampleCount,
  });
  return decision.blendedMins;
}
