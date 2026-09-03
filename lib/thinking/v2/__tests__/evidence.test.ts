import { describe, it, expect } from 'vitest';
import {
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  classifySampleStrength,
  classifyEffectStrength,
  classifyConsistencyStrength,
  median,
  mean,
  iqr,
  standardDeviation,
  effectMagnitudeFromRatio,
  consistencyFromValues,
} from '../evidence';

describe('evidence - sample size', () => {
  it('classifies sample strength by count', () => {
    expect(classifySampleStrength(0)).toBe('low');
    expect(classifySampleStrength(1)).toBe('low');
    expect(classifySampleStrength(3)).toBe('low');
    expect(classifySampleStrength(4)).toBe('medium');
    expect(classifySampleStrength(6)).toBe('medium');
    expect(classifySampleStrength(7)).toBe('high');
    expect(classifySampleStrength(20)).toBe('high');
  });

  it('records sampleSize on the evidence object', () => {
    const ev = buildEvidence({ sampleSize: 5, values: [1, 1, 1, 1, 1] });
    expect(ev.sampleSize).toBe(5);
  });
});

describe('evidence - effect magnitude', () => {
  it('computes effect magnitude from ratio deviation from 1.0', () => {
    expect(effectMagnitudeFromRatio(1.0)).toBe(0);
    expect(effectMagnitudeFromRatio(1.5)).toBeCloseTo(0.5);
    expect(effectMagnitudeFromRatio(0.5)).toBeCloseTo(0.5);
    expect(effectMagnitudeFromRatio(0.2)).toBeCloseTo(0.8);
    expect(effectMagnitudeFromRatio(2.1)).toBe(1);
  });

  it('sets effectMagnitude from median ratio', () => {
    const ev = buildEvidence({ sampleSize: 5, values: [1.5, 1.5, 1.5, 1.5, 1.5] });
    expect(ev.effectMagnitude).toBeCloseTo(0.5);
  });
});

describe('evidence - consistency & variance', () => {
  it('returns null variance for single sample', () => {
    const ev = buildEvidence({ sampleSize: 1, values: [2] });
    expect(ev.variance).toBeNull();
    expect(ev.consistency).toBeNull();
  });

  it('detects low variance as high consistency', () => {
    const ev = buildEvidence({ sampleSize: 5, values: [10, 10, 10, 10, 10] });
    expect(ev.consistency).toBe(1);
  });

  it('detects high variance as low consistency', () => {
    const ev = buildEvidence({ sampleSize: 5, values: [10, 100, 10, 100, 10] });
    expect(ev.consistency).toBeLessThan(0.5);
  });

  it('classifies consistency strength', () => {
    expect(classifyConsistencyStrength(0.9)).toBe('high');
    expect(classifyConsistencyStrength(0.7)).toBe('medium');
    expect(classifyConsistencyStrength(0.5)).toBe('low');
    expect(classifyConsistencyStrength(null)).toBe('low');
  });
});

describe('evidence - recency, contradiction, missing data', () => {
  it('records recency passed through', () => {
    const ev = buildEvidence({ sampleSize: 3, values: [1, 1, 1], recencyDays: 5 });
    expect(ev.recency).toBe(5);
  });

  it('records contradiction count', () => {
    const ev = buildEvidence({ sampleSize: 3, values: [1, 1, 1], contradictionCount: 2 });
    expect(ev.contradictionCount).toBe(2);
  });

  it('records missing data count', () => {
    const ev = buildEvidence({ sampleSize: 3, values: [1, 1, 1], missingDataCount: 4 });
    expect(ev.missingDataCount).toBe(4);
  });

  it('records specificity', () => {
    const ev = buildEvidence({ sampleSize: 3, values: [1, 1, 1], specificity: 0.8 });
    expect(ev.specificity).toBe(0.8);
  });
});

describe('evidence - zero denominator / fabricated evidence prevention', () => {
  it('marks insufficient when sampleSize is zero', () => {
    const ev = buildEvidence({ sampleSize: 0, values: [] });
    expect(ev.insufficient).toBe(true);
    expect(ev.effectMagnitude).toBeNull();
    expect(ev.consistency).toBeNull();
    expect(ev.variance).toBeNull();
    expect(ev.specificity).toBeNull();
    expect(ev.measurements).toEqual([]);
  });

  it('never invents a value for an empty sample', () => {
    const ev = buildEvidence({ sampleSize: 0, values: [] });
    // No fabricated plausible number
    expect(ev.effectMagnitude).toBeNull();
    expect(ev.consistency).toBeNull();
  });
});

describe('evidence - confidence derivation', () => {
  it('derives high confidence only when all dimensions are high', () => {
    const ev = buildEvidence({ sampleSize: 10, values: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0] });
    // effectMagnitude = 0 (low), so can't be all high
    const dims = deriveConfidenceDimensions(ev);
    expect(dims.sampleStrength).toBe('high');
    expect(dims.effectStrength).toBe('low');
    expect(dims.consistencyStrength).toBe('high');
  });

  it('medium when at least two dimensions are medium+', () => {
    const dims = { sampleStrength: 'medium' as const, effectStrength: 'medium' as const, consistencyStrength: 'low' as const };
    expect(deriveConfidence(dims)).toBe('medium');
  });

  it('low when few dimensions reach medium', () => {
    const dims = { sampleStrength: 'low' as const, effectStrength: 'low' as const, consistencyStrength: 'low' as const };
    expect(deriveConfidence(dims)).toBe('low');
  });
});

describe('evidence - robust statistics', () => {
  it('computes median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('computes mean', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('computes standard deviation', () => {
    expect(standardDeviation([1])).toBeNull();
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it('computes IQR only with enough data', () => {
    expect(iqr([1, 2, 3])).toBeNull();
    expect(iqr([1, 2, 3, 4])).not.toBeNull();
  });

  it('consistency needs at least two values', () => {
    expect(consistencyFromValues([5])).toBeNull();
    expect(consistencyFromValues([5, 5])).toBe(1);
  });
});
