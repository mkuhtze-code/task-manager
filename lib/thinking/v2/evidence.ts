import { Confidence } from '../types';

export type StalenessStatus = 'current' | 'stale';
export type ContradictionStatus = 'none' | 'partial' | 'full';

/**
 * The level of reasoning an observation operates at. These are never
 * silently promoted — a raw fact is not an observation, an association is
 * never asserted as causation, a hypothesis is never reported as a finding.
 *
 *   - raw_fact           unprocessed data point (e.g. actual_mins = 45)
 *   - derived_measurement calculated from raw facts (ratio = 1.5)
 *   - association        statistical co-occurrence (no causal claim)
 *   - observation        structured, evidence-backed statement
 *   - hypothesis         tentative, requires further data
 */
export type EvidenceKind =
  | 'raw_fact'
  | 'derived_measurement'
  | 'association'
  | 'observation'
  | 'hypothesis';

export interface Evidence {
  sampleSize: number;
  effectMagnitude: number | null;
  consistency: number | null;
  variance: number | null;
  recency: number | null;
  contradictionCount: number;
  missingDataCount: number;
  specificity: number | null;
  measurements: unknown[];
  insufficient: boolean;
  /** Level of reasoning; defaults to 'observation'. */
  evidenceKind: EvidenceKind;
}

export interface ConfidenceDimensions {
  sampleStrength: Confidence;
  effectStrength: Confidence;
  consistencyStrength: Confidence;
}

export function classifySampleStrength(n: number): Confidence {
  if (n >= 7) return 'high';
  if (n >= 4) return 'medium';
  return 'low';
}

export function classifyEffectStrength(magnitude: number | null): Confidence {
  if (magnitude === null) return 'low';
  if (magnitude >= 0.5) return 'high';
  if (magnitude >= 0.3) return 'medium';
  return 'low';
}

export function classifyConsistencyStrength(consistency: number | null): Confidence {
  if (consistency === null) return 'low';
  if (consistency >= 0.8) return 'high';
  if (consistency >= 0.6) return 'medium';
  return 'low';
}

export function deriveConfidenceDimensions(evidence: Evidence): ConfidenceDimensions {
  return {
    sampleStrength: classifySampleStrength(evidence.sampleSize),
    effectStrength: classifyEffectStrength(evidence.effectMagnitude),
    consistencyStrength: classifyConsistencyStrength(evidence.consistency),
  };
}

export function deriveConfidence(dims: ConfidenceDimensions): Confidence {
  const levels: Confidence[] = [dims.sampleStrength, dims.effectStrength, dims.consistencyStrength];
  const highCount = levels.filter((l) => l === 'high').length;
  const mediumCount = levels.filter((l) => l === 'medium').length;

  if (highCount === 3) return 'high';
  if (highCount + mediumCount >= 2) return 'medium';
  return 'low';
}

export function daysSince(dateStr: string | null, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 0;
  return diffMs / (1000 * 60 * 60 * 24);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function iqr(values: number[]): number | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  return sorted[q3Idx] - sorted[q1Idx];
}

export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function effectMagnitudeFromRatio(ratio: number): number {
  const deviation = Math.abs(ratio - 1.0);
  return Math.min(deviation, 1.0);
}

export function consistencyFromValues(values: number[]): number | null {
  if (values.length < 2) return null;
  const sd = standardDeviation(values);
  const m = mean(values);
  if (sd === null || m === null || m === 0) return null;
  const cv = sd / Math.abs(m);
  return Math.max(0, 1 - cv);
}

export function buildEvidence(params: {
  sampleSize: number;
  values: number[];
  contradictionCount?: number;
  missingDataCount?: number;
  recencyDays?: number | null;
  specificity?: number | null;
  measurements?: unknown[];
  insufficient?: boolean;
  effectMagnitude?: number | null;
  evidenceKind?: EvidenceKind;
}): Evidence {
  const {
    sampleSize,
    values,
    contradictionCount = 0,
    missingDataCount = 0,
    recencyDays = null,
    specificity = null,
    measurements = [],
    insufficient = false,
    effectMagnitude: explicitEffectMagnitude,
    evidenceKind = 'observation',
  } = params;

  // Insufficiency means the observation does NOT have enough valid evidence
  // to support the claim. This is broader than sampleSize === 0. A detector
  // may also pass an explicit `insufficient` flag when it detects a missing
  // denominator, a missing comparison baseline, invalid timestamps where
  // temporal evidence is required, etc.
  const effectivelyInsufficient =
    insufficient ||
    sampleSize === 0 ||
    (sampleSize > 0 && values.length === 0);

  if (effectivelyInsufficient) {
    return {
      sampleSize,
      effectMagnitude: null,
      consistency: null,
      variance: null,
      recency: recencyDays,
      contradictionCount,
      missingDataCount,
      specificity: null,
      measurements: [],
      insufficient: true,
      evidenceKind: 'hypothesis',
    };
  }

  // Effect magnitude is intentionally supplied by the detector when the
  // values are NOT estimate ratios (e.g. task-context comparisons, cluster
  // associations). When values ARE ratios (e.g. estimate calibration) and no
  // explicit magnitude is given, it is derived from the median ratio's
  // deviation from 1.0.
  const med = median(values);
  const effectMag =
    explicitEffectMagnitude !== undefined
      ? explicitEffectMagnitude
      : med !== null
        ? effectMagnitudeFromRatio(med)
        : null;
  const consistency = consistencyFromValues(values);
  const variance = standardDeviation(values);

  return {
    sampleSize,
    effectMagnitude: effectMag,
    consistency,
    variance,
    recency: recencyDays,
    contradictionCount,
    missingDataCount,
    specificity,
    measurements,
    insufficient: false,
    evidenceKind,
  };
}

/**
 * Build an explicitly insufficient Evidence object. Used by detectors when
 * the data cannot legitimately support an observation (zero denominator,
 * missing baseline, invalid required timestamps, etc.) — without inventing
 * any null measurement into a fabricated value.
 */
export function insufficientEvidence(params: {
  sampleSize: number;
  missingDataCount?: number;
  contradictionCount?: number;
  recencyDays?: number | null;
}): Evidence {
  return buildEvidence({
    sampleSize: params.sampleSize,
    values: [],
    missingDataCount: params.missingDataCount ?? 0,
    contradictionCount: params.contradictionCount ?? 0,
    recencyDays: params.recencyDays ?? null,
    insufficient: true,
  });
}
