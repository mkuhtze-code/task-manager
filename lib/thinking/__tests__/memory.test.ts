// lib/thinking/__tests__/memory.test.ts
import { describe, it, expect } from 'vitest';
import {
  averageDuration,
  decayWeightedAverage,
  detectTrend,
  summarizeCluster,
} from '../memory';

describe('averageDuration', () => {
  it('returns 0 for empty array', () => {
    expect(averageDuration([])).toBe(0);
  });

  it('returns the single value for one element', () => {
    expect(averageDuration([30])).toBe(30);
  });

  it('returns the average of two elements', () => {
    expect(averageDuration([20, 40])).toBe(30);
  });

  it('rounds to nearest integer', () => {
    expect(averageDuration([10, 11])).toBe(11);
  });

  it('handles large values', () => {
    expect(averageDuration([600, 900, 1200])).toBe(900);
  });
});

describe('decayWeightedAverage', () => {
  it('returns 0 for empty array', () => {
    expect(decayWeightedAverage([])).toBe(0);
  });

  it('returns the single value for one element', () => {
    expect(decayWeightedAverage([30])).toBe(30);
  });

  it('weights recent values more heavily', () => {
    // [10, 10, 10, 10, 100] — the recent 100 should pull the average up
    const simple = averageDuration([10, 10, 10, 10, 100]);
    const decayed = decayWeightedAverage([10, 10, 10, 10, 100]);
    // Decay average should be higher because the 100 is recent
    expect(decayed).toBeGreaterThan(simple);
  });

  it('weights older values less when they are high', () => {
    // [100, 10, 10, 10, 10] — the 100 is old, should have less weight
    const simple = averageDuration([100, 10, 10, 10, 10]);
    const decayed = decayWeightedAverage([100, 10, 10, 10, 10]);
    // Decay average should be lower because the 100 is old
    expect(decayed).toBeLessThan(simple);
  });

  it('returns the value for identical elements', () => {
    expect(decayWeightedAverage([25, 25, 25, 25])).toBe(25);
  });

  it('respects custom half-life', () => {
    // With a very short half-life, recent values dominate even more
    const shortHalfLife = decayWeightedAverage([10, 10, 100], 1);
    const longHalfLife = decayWeightedAverage([10, 10, 100], 10);
    expect(shortHalfLife).toBeGreaterThan(longHalfLife);
  });
});

describe('detectTrend', () => {
  it('returns stable for empty array', () => {
    expect(detectTrend([])).toBe('stable');
  });

  it('returns stable for single element', () => {
    expect(detectTrend([30])).toBe('stable');
  });

  it('returns stable for two elements', () => {
    expect(detectTrend([30, 40])).toBe('stable');
  });

  it('returns stable when durations are consistent', () => {
    expect(detectTrend([30, 31, 29, 30, 31, 30])).toBe('stable');
  });

  it('returns improving when second half is faster', () => {
    // First half: ~40min, second half: ~20min → improving
    expect(detectTrend([40, 42, 38, 20, 18, 22])).toBe('improving');
  });

  it('returns worsening when second half is slower', () => {
    // First half: ~20min, second half: ~40min → worsening
    expect(detectTrend([20, 18, 22, 40, 42, 38])).toBe('worsening');
  });
});

describe('summarizeCluster', () => {
  it('returns correct stats for a simple cluster', () => {
    const result = summarizeCluster([30, 31, 29], 'quote reroof');
    expect(result.avgMins).toBe(30);
    expect(result.totalMins).toBe(90);
    expect(result.confidence).toBe('low'); // 3 samples
    expect(result.trend).toBe('stable');
  });

  it('returns medium confidence for 4+ samples', () => {
    const result = summarizeCluster([20, 30, 25, 35], 'quote reroof');
    expect(result.confidence).toBe('medium');
  });

  it('returns high confidence for 7+ samples', () => {
    const result = summarizeCluster([20, 30, 25, 35, 28, 32, 22], 'quote reroof');
    expect(result.confidence).toBe('high');
  });
});
