import { describe, it, expect } from 'vitest';
import {
  clusterIdFromTokens,
  buildClusterModels,
  matchCluster,
  jaccard,
  tokenSet,
} from '../clusters';
import {
  buildPersonalModel,
  lookupHierarchicalDuration,
  lookupSameDayRate,
  maturityFromEvidence,
  learningPhaseFromClosedCount,
  historySampleFromRow,
} from '../model';

describe('v3 clusters', () => {
  it('clusterId is stable for same tokens regardless of order', () => {
    const a = clusterIdFromTokens(['site', 'measure']);
    const b = clusterIdFromTokens(['measure', 'site']);
    expect(a).toBe(b);
    expect(a.startsWith('c_')).toBe(true);
  });

  it('jaccard is 1 for identical sets', () => {
    const s = tokenSet('measure site access');
    expect(jaccard(s, s)).toBe(1);
  });

  it('buildClusterModels groups similar texts', () => {
    const samples = [
      { text: 'Measure site access', actualMins: 45, createdAt: '2026-01-01', completedAt: '2026-01-01' },
      { text: 'Measure site entry', actualMins: 50, createdAt: '2026-01-02', completedAt: '2026-01-02' },
      { text: 'Buy screws hardware', actualMins: 20, createdAt: '2026-01-03', completedAt: '2026-01-05' },
    ];
    const clusters = buildClusterModels(samples);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    const measure = clusters.find((c) => c.tokens.includes('measure'));
    expect(measure).toBeTruthy();
    expect(measure!.durationSamples.length).toBe(2);
    expect(measure!.duration).not.toBeNull();
  });

  it('matchCluster returns null below threshold', () => {
    const clusters = buildClusterModels([
      { text: 'Invoice client billing', actualMins: 30 },
    ]);
    expect(matchCluster('completely unrelated xyz', clusters)).toBeNull();
  });
});

describe('v3 personal model', () => {
  const updatedAt = '2026-09-28T00:00:00.000Z';

  it('cold model when no samples', () => {
    const model = buildPersonalModel({
      userId: 'u1',
      samples: [],
      updatedAt,
    });
    expect(model.state.maturity).toBe('cold');
    expect(model.state.learningPhase).toBe('prior');
    expect(model.clusters).toHaveLength(0);
  });

  it('lookup falls back to onboarding floor when no history', () => {
    const model = buildPersonalModel({
      userId: 'u1',
      samples: [],
      priors: { softFloorMins: 35 },
      updatedAt,
    });
    const d = lookupHierarchicalDuration('Anything novel', model);
    expect(d.level).toBe('onboarding');
    expect(d.distribution.expectedMins).toBe(35);
    expect(d.authority).toBe('observe');
  });

  it('lookup uses cluster when samples exist', () => {
    const samples = [
      { text: 'Site measure plan', actualMins: 40, createdAt: '2026-01-01T10:00:00Z', completedAt: '2026-01-01T11:00:00Z' },
      { text: 'Site measure review', actualMins: 44, createdAt: '2026-01-02T10:00:00Z', completedAt: '2026-01-02T11:00:00Z' },
      { text: 'Site measure final', actualMins: 42, createdAt: '2026-01-03T10:00:00Z', completedAt: '2026-01-03T11:00:00Z' },
    ];
    const model = buildPersonalModel({ userId: 'u1', samples, updatedAt });
    const d = lookupHierarchicalDuration('Site measure check', model);
    expect(d.level).toBe('cluster');
    expect(d.clusterId).not.toBeNull();
    expect(d.distribution.expectedMins).toBeGreaterThan(30);
    expect(d.distribution.expectedMins).toBeLessThan(55);
  });

  it('sparse cluster shrinks toward user median', () => {
    const samples = [
      { text: 'Unique alpha task', actualMins: 90 },
      { text: 'Other work beta', actualMins: 30 },
      { text: 'Other work gamma', actualMins: 32 },
      { text: 'Other work delta', actualMins: 28 },
    ];
    const model = buildPersonalModel({ userId: 'u1', samples, updatedAt });
    const d = lookupHierarchicalDuration('Unique alpha task', model);
    if (d.level === 'cluster') {
      expect(d.distribution.expectedMins).toBeLessThan(90);
      expect(d.reasons.some((r) => r.includes('shrunk'))).toBe(true);
    }
  });

  it('same-day rate from cluster', () => {
    const samples = [
      { text: 'Email report send', actualMins: 15, createdAt: '2026-01-01', completedAt: '2026-01-01' },
      { text: 'Email report draft', actualMins: 18, createdAt: '2026-01-02', completedAt: '2026-01-02' },
      { text: 'Email report final', actualMins: 20, createdAt: '2026-01-03', completedAt: '2026-01-04' },
    ];
    const model = buildPersonalModel({ userId: 'u1', samples, updatedAt });
    const s = lookupSameDayRate('Email report review', model);
    expect(s.level).toBe('cluster');
    expect(s.rate).not.toBeNull();
    expect(s.samples).toBeGreaterThanOrEqual(2);
  });

  it('maturity and learning phase helpers', () => {
    expect(learningPhaseFromClosedCount(0)).toBe('prior');
    expect(learningPhaseFromClosedCount(2)).toBe('early');
    expect(learningPhaseFromClosedCount(5)).toBe('established');
    expect(
      maturityFromEvidence({
        closedSampleCount: 0,
        clusterCount: 0,
        clustersWithDuration: 0,
        meanConsistency: null,
      })
    ).toBe('cold');
    expect(
      maturityFromEvidence({
        closedSampleCount: 8,
        clusterCount: 5,
        clustersWithDuration: 4,
        meanConsistency: 0.8,
      })
    ).toBe('stable');
  });

  it('historySampleFromRow drops non-positive actuals', () => {
    const s = historySampleFromRow({ text: 'x', actual_mins: 0 });
    expect(s.actualMins).toBeNull();
  });

  it('buildPersonalModel records closed-loop calibration', () => {
    const model = buildPersonalModel({
      userId: 'u1',
      samples: [
        { text: 'Task a', actualMins: 40 },
        { text: 'Task b', actualMins: 42 },
      ],
      closedOutcomes: [
        { predictedMins: 30, actualMins: 40 },
        { predictedMins: 30, actualMins: 42 },
        { predictedMins: 30, actualMins: 38 },
        { predictedMins: 30, actualMins: 41 },
      ],
      updatedAt,
    });
    expect(model.state.closedSampleCount).toBe(4);
    expect(model.state.calibration.durationBias).not.toBeNull();
    expect(model.state.calibration.durationBias!).toBeGreaterThan(1);
  });
});
