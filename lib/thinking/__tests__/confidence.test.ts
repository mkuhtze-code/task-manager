// lib/thinking/__tests__/confidence.test.ts
import { describe, it, expect } from 'vitest';
import {
  classifyConfidence,
  BLEND_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  MIN_SAMPLES_FOR_BLENDING,
} from '../confidence';

describe('classifyConfidence', () => {
  it('returns low for 0 samples', () => {
    expect(classifyConfidence(0)).toBe('low');
  });

  it('returns low for 1 sample', () => {
    expect(classifyConfidence(1)).toBe('low');
  });

  it('returns low for 3 samples (just below medium)', () => {
    expect(classifyConfidence(3)).toBe('low');
  });

  it('returns medium at exactly 4 samples', () => {
    expect(classifyConfidence(4)).toBe('medium');
  });

  it('returns medium for 6 samples (just below high)', () => {
    expect(classifyConfidence(6)).toBe('medium');
  });

  it('returns high at exactly 7 samples', () => {
    expect(classifyConfidence(7)).toBe('high');
  });

  it('returns high for large sample counts', () => {
    expect(classifyConfidence(100)).toBe('high');
  });
});

describe('BLEND_WEIGHTS', () => {
  it('has increasing weights from low to high', () => {
    expect(BLEND_WEIGHTS.low).toBeLessThan(BLEND_WEIGHTS.medium);
    expect(BLEND_WEIGHTS.medium).toBeLessThan(BLEND_WEIGHTS.high);
  });

  it('low weight is 0.25', () => {
    expect(BLEND_WEIGHTS.low).toBe(0.25);
  });

  it('medium weight is 0.5', () => {
    expect(BLEND_WEIGHTS.medium).toBe(0.5);
  });

  it('high weight is 0.75', () => {
    expect(BLEND_WEIGHTS.high).toBe(0.75);
  });
});

describe('constants', () => {
  it('MIN_SAMPLES_FOR_BLENDING is 2', () => {
    expect(MIN_SAMPLES_FOR_BLENDING).toBe(2);
  });

  it('CONFIDENCE_THRESHOLDS has correct values', () => {
    expect(CONFIDENCE_THRESHOLDS.medium).toBe(4);
    expect(CONFIDENCE_THRESHOLDS.high).toBe(7);
  });
});
