// lib/thinking/decisions/effectiveEstimate.ts
//
// The core decision: given what the person typed and what the engine
// has learned from history, what estimate should capacity math use?
//
// The person-facing display estimate is NEVER changed — this only
// affects the internal capacity picture (the ring, the day rail,
// overflow flags).

import type { EffectiveEstimateDecision, Confidence } from '../types';
import { BLEND_WEIGHTS, MIN_SAMPLES_FOR_BLENDING } from '../confidence';

export type { Confidence } from '../types';

export function hasMeaningfulDivergence(
  typedMins: number,
  suggestedMins: number
): boolean {
  const diff = Math.abs(suggestedMins - typedMins);
  return diff >= 5 && diff / Math.max(typedMins, 1) >= 0.15;
}

export function computeEffectiveEstimate(params: {
  typedMins: number;
  suggestedMins: number | null;
  confidence: Confidence;
  clusterCount: number;
  /**
   * From prediction-log calibration. Scales how hard we lean on learned
   * duration (0.5–1.25). Default 1 = unchanged blend weights.
   */
  blendScale?: number;
}): EffectiveEstimateDecision {
  const { typedMins, suggestedMins, confidence, clusterCount } = params;
  const blendScale = Math.min(1.25, Math.max(0.5, params.blendScale ?? 1));

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

  const weight = Math.min(0.9, BLEND_WEIGHTS[confidence] * blendScale);
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

export function effectiveEstimate(
  typedMins: number,
  suggestion: { suggestedMins: number; confidence: Confidence; sampleCount: number } | null,
  blendScale?: number
): number {
  if (!suggestion) return typedMins;
  const decision = computeEffectiveEstimate({
    typedMins,
    suggestedMins: suggestion.suggestedMins,
    confidence: suggestion.confidence,
    clusterCount: suggestion.sampleCount,
    blendScale,
  });
  return decision.blendedMins;
}
