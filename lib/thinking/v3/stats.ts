// lib/thinking/v3/stats.ts
//
// Phase 3 — robust statistics for the thinking engine.
//
// Pure, deterministic, no network, no Date.now().
// Prefer median / MAD / IQR over mean / SD for duration data
// (skewed, outliers from taps and interruptions are common).
//
// Runtime paths may keep simple averages until deliberately switched;
// these utilities are the canonical toolkit for V3 duration beliefs.

import type { DurationDistribution } from './types';

function sortedCopy(values: number[]): number[] {
  return [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

/** Arithmetic mean. Returns null for empty. */
export function mean(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Median. Preferred centre for duration samples.
 * Even length → average of two middle values.
 */
export function median(values: number[]): number | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 0) {
    return (xs[mid - 1] + xs[mid]) / 2;
  }
  return xs[mid];
}

/**
 * Trimmed mean — drop a fraction from each tail then average.
 * trimFraction in [0, 0.45]; default 0.1 (10% each side).
 */
export function trimmedMean(
  values: number[],
  trimFraction = 0.1
): number | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;
  const t = Math.min(0.45, Math.max(0, trimFraction));
  const k = Math.floor(xs.length * t);
  if (xs.length - 2 * k <= 0) return median(xs);
  const core = xs.slice(k, xs.length - k);
  return mean(core);
}

/** Weighted average. lengths must match; non-finite pairs skipped. */
export function weightedAverage(
  values: number[],
  weights: number[]
): number | null {
  if (values.length !== weights.length || values.length === 0) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (!Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    num += v * w;
    den += w;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Exponential recency weights for a sequence ordered oldest → newest.
 * Most recent index gets weight 1; age `a` gets exp(-ln2 * a / halfLife).
 */
export function recencyWeights(length: number, halfLife = 5): number[] {
  if (length <= 0) return [];
  const hl = Math.max(0.5, halfLife);
  const decay = Math.LN2 / hl;
  const weights: number[] = [];
  for (let i = 0; i < length; i++) {
    const age = length - 1 - i;
    weights.push(Math.exp(-decay * age));
  }
  return weights;
}

/** Recency-weighted mean (oldest → newest order). */
export function recencyWeightedMean(
  values: number[],
  halfLife = 5
): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  return weightedAverage(xs, recencyWeights(xs.length, halfLife));
}

/** Approximate recency-weighted median via weighted percentile. */
export function recencyWeightedMedian(
  values: number[],
  halfLife = 5
): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const weights = recencyWeights(xs.length, halfLife);
  return weightedPercentile(xs, weights, 0.5);
}

/** Sample standard deviation (n-1). null if < 2 points. */
export function standardDeviation(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return null;
  const m = mean(xs);
  if (m === null) return null;
  const var_ =
    xs.reduce((sum, v) => sum + (v - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(var_);
}

/** Median absolute deviation (raw, not scaled). */
export function mad(values: number[]): number | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;
  const med = median(xs);
  if (med === null) return null;
  const deviations = xs.map((v) => Math.abs(v - med));
  return median(deviations);
}

/** MAD scaled to approximate SD under normality (×1.4826). */
export function madScaled(values: number[]): number | null {
  const m = mad(values);
  if (m === null) return null;
  return m * 1.4826;
}

/** Percentile in [0, 1] via linear interpolation on sorted values. */
export function percentile(values: number[], p: number): number | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  if (xs.length === 1) return xs[0];
  const idx = clamped * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  const t = idx - lo;
  return xs[lo] * (1 - t) + xs[hi] * t;
}

/** Interquartile range (p75 − p25). null if < 4 samples. */
export function iqr(values: number[]): number | null {
  const xs = sortedCopy(values);
  if (xs.length < 4) return null;
  const q1 = percentile(xs, 0.25);
  const q3 = percentile(xs, 0.75);
  if (q1 === null || q3 === null) return null;
  return q3 - q1;
}

/** Weighted percentile. */
export function weightedPercentile(
  values: number[],
  weights: number[],
  p: number
): number | null {
  if (values.length !== weights.length || values.length === 0) return null;
  const pairs: Array<{ v: number; w: number }> = [];
  for (let i = 0; i < values.length; i++) {
    if (
      !Number.isFinite(values[i]) ||
      !Number.isFinite(weights[i]) ||
      weights[i] <= 0
    ) {
      continue;
    }
    pairs.push({ v: values[i], w: weights[i] });
  }
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  const target = Math.min(1, Math.max(0, p)) * total;
  let cum = 0;
  for (const pair of pairs) {
    cum += pair.w;
    if (cum >= target) return pair.v;
  }
  return pairs[pairs.length - 1].v;
}

/**
 * Shrink observed centre toward a prior.
 * effective = (n * observed + priorStrength * prior) / (n + priorStrength)
 */
export function shrinkTowardPrior(
  observed: number,
  prior: number,
  sampleSize: number,
  priorStrength = 3
): number {
  const n = Math.max(0, sampleSize);
  const ps = Math.max(0, priorStrength);
  if (n + ps === 0) return prior;
  return (n * observed + ps * prior) / (n + ps);
}

/** Blend typed estimate with learned suggestion. weight in [0,1] on suggestion. */
export function blendEstimates(
  typedMins: number,
  suggestedMins: number,
  weight: number
): number {
  const w = Math.min(1, Math.max(0, weight));
  return typedMins * (1 - w) + suggestedMins * w;
}

export type RobustSpread = {
  centre: number;
  low: number;
  high: number;
  method: 'iqr' | 'mad' | 'sd' | 'prior_width';
  sampleSize: number;
};

/**
 * Robust centre + interval for planning.
 * Prefers median + 1.5×MAD (or IQR/2) when samples allow.
 */
export function robustInterval(
  values: number[],
  opts?: {
    minHalfWidth?: number;
    scale?: number;
  }
): RobustSpread | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;

  const minHalf = opts?.minHalfWidth ?? 5;
  const scale = opts?.scale ?? 1.5;
  const centre = median(xs) ?? xs[0];
  const n = xs.length;

  if (n === 1) {
    const half = Math.max(minHalf, Math.round(centre * 0.25));
    return {
      centre: Math.round(centre),
      low: Math.max(1, Math.round(centre - half)),
      high: Math.round(centre + half),
      method: 'prior_width',
      sampleSize: 1,
    };
  }

  const madVal = mad(xs);
  const iqrVal = iqr(xs);

  let half: number;
  let method: RobustSpread['method'];

  if (madVal != null && madVal > 0) {
    half = madVal * scale;
    method = 'mad';
  } else if (iqrVal != null && iqrVal > 0) {
    half = (iqrVal / 2) * scale;
    method = 'iqr';
  } else {
    const sd = standardDeviation(xs);
    if (sd != null && sd > 0) {
      half = sd * scale;
      method = 'sd';
    } else {
      half = Math.max(minHalf, centre * 0.2);
      method = 'prior_width';
    }
  }

  half = Math.max(minHalf, half);

  return {
    centre: Math.round(centre),
    low: Math.max(1, Math.round(centre - half)),
    high: Math.round(centre + half),
    method,
    sampleSize: n,
  };
}

/** Build a DurationDistribution from samples using robust centre. */
export function durationFromSamples(
  values: number[],
  method: DurationDistribution['method'] = 'median'
): DurationDistribution | null {
  const xs = sortedCopy(values);
  if (xs.length === 0) return null;

  let centre: number | null;
  switch (method) {
    case 'trimmed_mean':
      centre = trimmedMean(xs, 0.1);
      break;
    case 'weighted_median':
      centre = recencyWeightedMedian(xs);
      break;
    case 'median':
    default:
      centre = median(xs);
      break;
  }
  if (centre === null) return null;

  const interval = robustInterval(xs);
  return {
    expectedMins: Math.round(centre),
    interval: {
      low: interval?.low ?? Math.max(1, Math.round(centre * 0.75)),
      high: interval?.high ?? Math.round(centre * 1.25),
    },
    sampleSize: xs.length,
    method:
      method === 'weighted_median'
        ? 'weighted_median'
        : method === 'trimmed_mean'
          ? 'trimmed_mean'
          : 'median',
  };
}

/**
 * Consistency score in [0, 1]. Higher = more consistent.
 * Uses MAD/median when possible (robust CV).
 */
export function consistencyScore(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v) && v !== 0);
  if (xs.length < 2) return null;
  const med = median(xs);
  const m = mad(xs);
  if (med === null || m === null || med === 0) {
    const mu = mean(xs);
    const sd = standardDeviation(xs);
    if (mu === null || sd === null || mu === 0) return null;
    const cv = sd / Math.abs(mu);
    return Math.max(0, Math.min(1, 1 - cv));
  }
  const rcv = m / Math.abs(med);
  return Math.max(0, Math.min(1, 1 - rcv));
}

/** Effect magnitude from a ratio vs 1.0. Clamped to [0, 1]. */
export function effectMagnitudeFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.abs(ratio - 1));
}
