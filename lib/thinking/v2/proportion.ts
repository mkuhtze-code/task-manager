import {
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  Evidence,
} from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';

/**
 * Shared builder for proportion-vs-baseline observations (e.g. "72% of tasks
 * are planned in advance", "40% clear the same day").
 *
 * All rate-based detectors use this so that effect magnitude, consistency,
 * missing data and the reasoning level are computed identically and never
 * reinvented per detector.
 *
 * Rules enforced here:
 *   - A zero denominator is insufficient — no fabricated rate is emitted.
 *   - If a comparison baseline is required but is missing/invalid, the
 *     observation is marked insufficient rather than inventing a measurement.
 *   - Effect magnitude is the normalised deviation of the observed proportion
 *     from the baseline proportion (clamped to [0,1]).
 *   - Wording is descriptive; `title`/`description` are provided by the caller
 *     and must not imply causation.
 */

export interface ProportionEvidenceParams {
  /** Number of items in the numerator / observed subgroup. */
  count: number;
  /** Denominator — the base population the proportion is drawn from. */
  total: number;
  /** Baseline proportion (0..1) the observed proportion is compared against. */
  baseline: number | null;
  contradictionCount?: number;
  missingDataCount?: number;
  specificity?: number | null;
  measurements?: unknown[];
  evidenceKind?: 'association' | 'observation';
  /** When true, force insufficient (e.g. missing required baseline). */
  insufficient?: boolean;
}

export function buildProportionEvidence(params: ProportionEvidenceParams): {
  evidence: Evidence;
  confidenceDimensions: ReturnType<typeof deriveConfidenceDimensions>;
  confidence: ReturnType<typeof deriveConfidence>;
  rate: number | null;
  effect: number | null;
} {
  const {
    count,
    total,
    baseline,
    contradictionCount = 0,
    missingDataCount = 0,
    specificity = null,
    measurements = [],
    evidenceKind = 'observation',
    insufficient = false,
  } = params;

  const lows: ReturnType<typeof deriveConfidenceDimensions> = {
    sampleStrength: 'low',
    effectStrength: 'low',
    consistencyStrength: 'low',
  };

  // Zero denominator or a required-but-missing baseline → insufficient.
  if (total <= 0 || baseline === null || baseline < 0 || baseline > 1 || insufficient) {
    const evidence = buildEvidence({
      sampleSize: count,
      values: [],
      contradictionCount,
      missingDataCount,
      specificity: null,
      measurements: [],
      insufficient: true,
      recencyDays: null,
    });
    return {
      evidence,
      confidenceDimensions: lows,
      confidence: 'low',
      rate: null,
      effect: null,
    };
  }

  const rate = count / total;
  // In a [0,1] outcome space, max meaningful deviation from baseline is bounded
  // by distance to the nearer edge. Normalise so the full budget is used.
  const maxDeviation = Math.max(baseline, 1 - baseline);
  const effect = maxDeviation > 0 ? Math.min(Math.abs(rate - baseline) / maxDeviation, 1) : 0;

  // Consistency approximates how much of the population aligns with the effect.
  const consistency = Math.max(0, 1 - Math.abs(rate - baseline));

  const evidence = buildEvidence({
    sampleSize: count,
    values: [rate],
    contradictionCount,
    missingDataCount,
    specificity: specificity ?? null,
    measurements,
    insufficient: false,
    evidenceKind,
    effectMagnitude: effect,
  });

  const consistencyStrength = effect >= 0.6 ? 0.9 : consistency;
  const effectiveEvidence: Evidence = {
    ...evidence,
    consistency: consistencyStrength,
  };

  const confidenceDimensions = deriveConfidenceDimensions(effectiveEvidence);
  const confidence = deriveConfidence(confidenceDimensions);

  return {
    evidence: effectiveEvidence,
    confidenceDimensions,
    confidence,
    rate,
    effect,
  };
}

/**
 * Emit a proportion-based structured observation. Returns null when evidence
 * is insufficient (so insufficient observations are not emitted as findings).
 */
export function emitProportionObservation(params: {
  type: string;
  semanticType: string;
  title: string;
  description: string;
  count: number;
  total: number;
  baseline: number | null;
  affectedContext?: Partial<StructuredObservation['affectedContext']>;
  traceability: StructuredObservation['traceability'];
  contradictionCount?: number;
  missingDataCount?: number;
  specificity?: number | null;
  measurements?: unknown[];
  evidenceKind?: 'association' | 'observation';
  /** Minimum denominator required before a claim may be emitted. */
  minSample?: number;
  /** Minimum normalised effect above baseline before a claim may be emitted. */
  minEffect?: number;
}): StructuredObservation | null {
  // Conservative minimum-evidence gate: never emit a proportion claim from a
  // tiny, easily-misleading sample.
  const minSample = params.minSample ?? 3;
  if (params.total < minSample) return null;

  const result = buildProportionEvidence({
    count: params.count,
    total: params.total,
    baseline: params.baseline,
    contradictionCount: params.contradictionCount,
    missingDataCount: params.missingDataCount,
    specificity: params.specificity,
    measurements: params.measurements,
    evidenceKind: params.evidenceKind,
  });

  if (result.evidence.insufficient) return null;

  // Directional + magnitude gate: a proportion claim of the form "tasks tend
  // to X" is only emitted when the observed rate is clearly ABOVE the baseline
  // (confirming the behaviour) and the effect is meaningful. We never emit a
  // positive claim from a rate at or below baseline (which would mis-describe
  // the pattern), and we never emit a near-random tie.
  const minEffect = params.minEffect ?? 0.3;
  const rate = result.rate;
  const baseline = params.baseline;
  if (
    rate === null ||
    baseline === null ||
    result.effect === null ||
    rate <= baseline ||
    result.effect < minEffect
  ) {
    return null;
  }

  const id = observationIdentityKey({
    type: params.type,
    clusterLabel: params.affectedContext?.clusterLabel,
    timePeriod: params.affectedContext?.timePeriod,
    location: params.affectedContext?.location,
    jobId: params.affectedContext?.jobId,
  });

  return buildStructuredObservation({
    id,
    type: params.type,
    title: params.title,
    description: params.description,
    evidence: result.evidence,
    confidenceDimensions: result.confidenceDimensions,
    confidence: result.confidence,
    affectedContext: params.affectedContext ?? {},
    traceability: params.traceability,
    semanticType: params.semanticType,
  });
}
