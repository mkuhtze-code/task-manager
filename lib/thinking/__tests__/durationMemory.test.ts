// lib/thinking/__tests__/durationMemory.test.ts
import { describe, it, expect } from 'vitest';
import {
  observeDurationMemory,
  observeAllClusters,
} from '../observations/durationMemory';

describe('observeDurationMemory', () => {
  it('produces an observation with kind "duration_memory"', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'quote reroof',
      actuals: [30, 40, 35],
    });
    expect(obs.kind).toBe('duration_memory');
  });

  it('computes average correctly', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [20, 30, 40],
    });
    expect(obs.avgMins).toBe(30);
  });

  it('computes total correctly', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [20, 30, 40],
    });
    expect(obs.totalMins).toBe(90);
  });

  it('records lastActualMins as the most recent', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [20, 30, 40],
    });
    expect(obs.lastActualMins).toBe(40);
  });

  it('sets clusterCount from actuals length', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [20, 30, 40],
    });
    expect(obs.clusterCount).toBe(3);
  });

  it('detects improving trend', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [40, 42, 38, 20, 18, 22],
    });
    expect(obs.trend).toBe('improving');
  });

  it('detects worsening trend', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [20, 18, 22, 40, 42, 38],
    });
    expect(obs.trend).toBe('worsening');
  });

  it('detects stable trend', () => {
    const obs = observeDurationMemory({
      clusterLabel: 'task',
      actuals: [30, 31, 29, 30, 31, 30],
    });
    expect(obs.trend).toBe('stable');
  });
});

describe('observeAllClusters', () => {
  it('returns observations for clusters with 2+ samples', () => {
    const clusters = new Map([
      ['task A', [30, 40]],
      ['task B', [20]],
      ['task C', [15, 25, 35]],
    ]);
    const observations = observeAllClusters(clusters);
    expect(observations).toHaveLength(2);
    expect(observations.map((o) => o.clusterLabel).sort()).toEqual(['task A', 'task C']);
  });

  it('returns empty array for no qualifying clusters', () => {
    const clusters = new Map([['task A', [30]]]);
    const observations = observeAllClusters(clusters);
    expect(observations).toHaveLength(0);
  });
});
