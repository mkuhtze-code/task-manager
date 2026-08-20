// lib/thinking/__tests__/estimateAccuracy.test.ts
import { describe, it, expect } from 'vitest';
import {
  observeEstimateAccuracy,
  classifyAccuracy,
  summarizeAccuracy,
} from '../observations/estimateAccuracy';

describe('observeEstimateAccuracy', () => {
  it('produces an observation with kind "estimate_accuracy"', () => {
    const obs = observeEstimateAccuracy({
      taskText: 'quote reroof',
      clusterLabel: 'quote reroof',
      clusterCount: 5,
      estimatedMins: 30,
      actualMins: 45,
    });
    expect(obs.kind).toBe('estimate_accuracy');
  });

  it('computes ratio correctly', () => {
    const obs = observeEstimateAccuracy({
      taskText: 'task',
      clusterLabel: null,
      clusterCount: 0,
      estimatedMins: 30,
      actualMins: 60,
    });
    expect(obs.ratio).toBe(2.0);
  });

  it('handles zero estimated minutes', () => {
    const obs = observeEstimateAccuracy({
      taskText: 'task',
      clusterLabel: null,
      clusterCount: 0,
      estimatedMins: 0,
      actualMins: 15,
    });
    expect(obs.ratio).toBe(15); // 15 / max(0, 1) = 15
  });

  it('sets confidence from clusterCount', () => {
    const low = observeEstimateAccuracy({
      taskText: 'task', clusterLabel: null, clusterCount: 1,
      estimatedMins: 30, actualMins: 30,
    });
    expect(low.confidence).toBe('low');

    const high = observeEstimateAccuracy({
      taskText: 'task', clusterLabel: null, clusterCount: 10,
      estimatedMins: 30, actualMins: 30,
    });
    expect(high.confidence).toBe('high');
  });

  it('includes observedAt timestamp', () => {
    const before = Date.now();
    const obs = observeEstimateAccuracy({
      taskText: 'task', clusterLabel: null, clusterCount: 0,
      estimatedMins: 30, actualMins: 30,
    });
    const after = Date.now();
    const ts = new Date(obs.observedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('classifyAccuracy', () => {
  it('returns "accurate" when difference is less than 5 minutes', () => {
    expect(classifyAccuracy(30, 33)).toBe('accurate');
  });

  it('returns "accurate" when difference is small relative to estimate', () => {
    // 100 → 114: diff=14, 14/100=0.14 < 0.15
    expect(classifyAccuracy(100, 114)).toBe('accurate');
  });

  it('returns "over" when actual is significantly more', () => {
    expect(classifyAccuracy(30, 45)).toBe('over');
  });

  it('returns "under" when actual is significantly less', () => {
    expect(classifyAccuracy(30, 15)).toBe('under');
  });

  it('returns "accurate" for exact match', () => {
    expect(classifyAccuracy(30, 30)).toBe('accurate');
  });
});

describe('summarizeAccuracy', () => {
  it('returns defaults for empty observations', () => {
    const result = summarizeAccuracy([]);
    expect(result.total).toBe(0);
    expect(result.averageRatio).toBe(1);
    expect(result.accuracyPercent).toBe(100);
    expect(result.medianRatio).toBe(1);
  });

  it('computes average ratio correctly', () => {
    const observations = [
      observeEstimateAccuracy({ taskText: 'a', clusterLabel: null, clusterCount: 0, estimatedMins: 30, actualMins: 30 }),
      observeEstimateAccuracy({ taskText: 'b', clusterLabel: null, clusterCount: 0, estimatedMins: 30, actualMins: 60 }),
    ];
    const result = summarizeAccuracy(observations);
    expect(result.total).toBe(2);
    expect(result.averageRatio).toBe(1.5); // (1.0 + 2.0) / 2
  });

  it('computes median ratio correctly', () => {
    const observations = [
      observeEstimateAccuracy({ taskText: 'a', clusterLabel: null, clusterCount: 0, estimatedMins: 30, actualMins: 30 }),  // ratio 1.0
      observeEstimateAccuracy({ taskText: 'b', clusterLabel: null, clusterCount: 0, estimatedMins: 30, actualMins: 60 }),  // ratio 2.0
      observeEstimateAccuracy({ taskText: 'c', clusterLabel: null, clusterCount: 0, estimatedMins: 30, actualMins: 90 }),  // ratio 3.0
    ];
    const result = summarizeAccuracy(observations);
    expect(result.medianRatio).toBe(2.0); // middle value
  });
});
