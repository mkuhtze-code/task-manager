import { describe, it, expect } from 'vitest';
import {
  mean,
  median,
  trimmedMean,
  mad,
  madScaled,
  iqr,
  percentile,
  weightedAverage,
  recencyWeights,
  recencyWeightedMean,
  shrinkTowardPrior,
  blendEstimates,
  robustInterval,
  durationFromSamples,
  consistencyScore,
  effectMagnitudeFromRatio,
  standardDeviation,
} from '../stats';

describe('v3 robust stats', () => {
  it('median handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('mean and trimmedMean reduce outlier pull', () => {
    const xs = [10, 12, 11, 13, 100];
    expect(mean(xs)).toBeCloseTo(29.2);
    const t = trimmedMean(xs, 0.2);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThan(20);
  });

  it('mad is robust to a single outlier', () => {
    const clean = [10, 12, 11, 13, 12];
    const dirty = [10, 12, 11, 13, 12, 200];
    const madClean = mad(clean);
    const madDirty = mad(dirty);
    expect(madClean).not.toBeNull();
    expect(madDirty).not.toBeNull();
    expect(madDirty!).toBeLessThanOrEqual((madClean ?? 0) + 5);
    const sdDirty = standardDeviation(dirty)!;
    const sdClean = standardDeviation(clean)!;
    expect(sdDirty).toBeGreaterThan(sdClean * 5);
  });

  it('iqr and percentile', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 1)).toBe(8);
    expect(iqr(xs)).toBeGreaterThan(0);
  });

  it('recency weights favour the newest samples', () => {
    const w = recencyWeights(5, 5);
    expect(w[w.length - 1]).toBeGreaterThan(w[0]);
    expect(w[w.length - 1]).toBeCloseTo(1);
  });

  it('recencyWeightedMean shifts toward recent values', () => {
    const xs = [100, 100, 100, 20, 20];
    const simple = mean(xs)!;
    const rec = recencyWeightedMean(xs, 2)!;
    expect(rec).toBeLessThan(simple);
  });

  it('weightedAverage basic', () => {
    expect(weightedAverage([10, 30], [1, 1])).toBe(20);
    expect(weightedAverage([10, 30], [3, 1])).toBe(15);
  });

  it('shrinkTowardPrior moves toward prior when n is small', () => {
    const prior = 30;
    const observed = 60;
    const cold = shrinkTowardPrior(observed, prior, 1, 3);
    const warm = shrinkTowardPrior(observed, prior, 20, 3);
    expect(cold).toBeLessThan(observed);
    expect(cold).toBeGreaterThan(prior);
    expect(Math.abs(warm - observed)).toBeLessThan(Math.abs(cold - observed));
  });

  it('blendEstimates respects weight bounds', () => {
    expect(blendEstimates(40, 60, 0)).toBe(40);
    expect(blendEstimates(40, 60, 1)).toBe(60);
    expect(blendEstimates(40, 60, 0.5)).toBe(50);
  });

  it('robustInterval returns low < centre < high', () => {
    const r = robustInterval([20, 22, 25, 28, 30, 45]);
    expect(r).not.toBeNull();
    expect(r!.low).toBeLessThan(r!.centre);
    expect(r!.high).toBeGreaterThan(r!.centre);
    expect(r!.sampleSize).toBe(6);
  });

  it('durationFromSamples builds DurationDistribution', () => {
    const d = durationFromSamples([15, 20, 18, 22, 19], 'median');
    expect(d).not.toBeNull();
    expect(d!.expectedMins).toBe(19);
    expect(d!.sampleSize).toBe(5);
    expect(d!.interval.low).toBeLessThan(d!.expectedMins);
  });

  it('consistencyScore is higher for tight clusters', () => {
    const tight = consistencyScore([30, 31, 29, 30, 32])!;
    const loose = consistencyScore([10, 50, 20, 80, 30])!;
    expect(tight).toBeGreaterThan(loose);
  });

  it('effectMagnitudeFromRatio', () => {
    expect(effectMagnitudeFromRatio(1)).toBe(0);
    expect(effectMagnitudeFromRatio(1.5)).toBeCloseTo(0.5);
    expect(effectMagnitudeFromRatio(3)).toBe(1);
  });

  it('madScaled is larger than raw mad', () => {
    const xs = [10, 12, 11, 13, 12];
    expect(madScaled(xs)!).toBeGreaterThan(mad(xs)!);
  });
});
