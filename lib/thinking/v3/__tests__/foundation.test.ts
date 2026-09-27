import { describe, it, expect } from 'vitest';
import {
  sameTaskIdentity,
  distinctDespiteSameText,
  sequenceEdge,
} from '../identity';
import {
  buildClusterModels,
  matchCluster,
  weightedJaccard,
  discriminativeTokens,
  GENERIC_TOKENS,
  CLUSTER_VERSION,
} from '../clusters';
import {
  buildWorkEpisode,
  trainMinutesFromEpisode,
  safeActualForCalibration,
} from '../episodes';
import {
  sameLocalCalendarDay,
  completionAgeDays,
  taskAgeDaysAt,
  localDateString,
  buildUserCalendarContext,
} from '../temporal';
import { assessEvidenceQuality, propagateConfidence } from '../evidenceQuality';
import { multimodalDurationFromSamples, detectDurationModes } from '../durationModes';
import { calibrateFromPairs, logRatio } from '../calibrationMetrics';

describe('stable task identity', () => {
  it('treats different taskIds as distinct even with identical text', () => {
    const a = { taskId: 't1', text: 'Call John', userId: 'u1' };
    const b = { taskId: 't2', text: 'Call John', userId: 'u1' };
    expect(sameTaskIdentity(a, b)).toBe(false);
    expect(distinctDespiteSameText(a, b)).toBe(true);
  });

  it('sequence edges use ids not text', () => {
    const e = sequenceEdge('t1', 't2', { from: 'Call John', to: 'Call John' });
    expect(e.fromTaskId).toBe('t1');
    expect(e.toTaskId).toBe('t2');
  });
});

describe('hardened clustering', () => {
  it('does not cluster generic-verb tasks together', () => {
    const samples = [
      { text: 'Call Sarah', actualMins: 15 },
      { text: 'Call John', actualMins: 20 },
      { text: 'Call supplier', actualMins: 25 },
      { text: 'Review invoice', actualMins: 30 },
      { text: 'Review contract', actualMins: 45 },
      { text: 'Review photos', actualMins: 20 },
    ];
    const clusters = buildClusterModels(samples);
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    const callMatch = matchCluster('Call Sarah', clusters);
    const reviewMatch = matchCluster('Review invoice', clusters);
    if (callMatch && reviewMatch) {
      expect(callMatch.cluster.clusterId).not.toBe(reviewMatch.cluster.clusterId);
    }
  });

  it('is order-independent for the same sample multiset', () => {
    const base = [
      { text: 'Site measure access', actualMins: 60 },
      { text: 'Site measure access', actualMins: 55 },
      { text: 'Invoice client Smith', actualMins: 25 },
      { text: 'Invoice client Smith', actualMins: 30 },
      { text: 'Punch list walk', actualMins: 90 },
    ];
    const reversed = [...base].reverse();
    const c1 = buildClusterModels(base);
    const c2 = buildClusterModels(reversed);
    expect(c1.map((c) => c.clusterId).sort()).toEqual(
      c2.map((c) => c.clusterId).sort()
    );
  });

  it('downweights generic tokens', () => {
    const onlyGeneric = weightedJaccard(['call', 'with'], ['call', 'about']);
    const withDisc = weightedJaccard(['call', 'sarah'], ['call', 'sarah']);
    expect(withDisc).toBeGreaterThan(onlyGeneric);
    expect(GENERIC_TOKENS.has('call')).toBe(true);
    expect(discriminativeTokens('Call Sarah').includes('sarah')).toBe(true);
  });

  it('CLUSTER_VERSION is 2+', () => {
    expect(CLUSTER_VERSION).toBeGreaterThanOrEqual(2);
  });
});

describe('work episodes vs interruption contamination', () => {
  it('trains on active not interrupted elapsed', () => {
    const ep = buildWorkEpisode({
      episodeId: 'e1',
      taskId: 't1',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      endedAt: '2026-01-01T11:30:00Z',
      activeMinutes: 25,
      interruptionMinutes: 65,
      outcome: 'done',
    });
    expect(ep.activeMinutes).toBe(25);
    expect(ep.elapsedMinutes).toBe(90);
    expect(trainMinutesFromEpisode(ep)).toBe(25);
    expect(safeActualForCalibration(ep)).not.toBe(90);
  });

  it('marks legacy elapsed without breakdown as elapsed_only', () => {
    const ep = buildWorkEpisode({
      episodeId: 'e2',
      taskId: 't2',
      userId: 'u1',
      startedAt: '2026-01-01T10:00:00Z',
      endedAt: '2026-01-01T11:00:00Z',
      legacyActualMins: 60,
      outcome: 'done',
    });
    expect(ep.durationEvidence).toBe('elapsed_only');
    expect(ep.confidence).not.toBe('high');
  });

  it('refuses train minutes when interruption dominates', () => {
    const ep = buildWorkEpisode({
      episodeId: 'e3',
      taskId: 't3',
      userId: 'u1',
      startedAt: '2026-01-01T09:00:00Z',
      endedAt: '2026-01-01T12:00:00Z',
      legacyActualMins: 180,
      interruptionMinutes: 120,
      outcome: 'done',
    });
    expect(ep.durationEvidence).toBe('contaminated');
    expect(trainMinutesFromEpisode(ep)).toBeNull();
  });
});

describe('staleness / completion age', () => {
  it('uses completed_at - created_at, not wall-clock now', () => {
    const age = completionAgeDays(
      '2026-01-01T10:00:00Z',
      '2026-01-03T10:00:00Z'
    );
    expect(age).toBeCloseTo(2, 5);
    const openAge = taskAgeDaysAt(
      '2026-01-01T00:00:00Z',
      '2026-01-05T00:00:00Z'
    );
    expect(openAge).toBeCloseTo(4, 5);
  });

  it('sameLocalCalendarDay is timezone-aware', () => {
    const a = '2026-03-28T12:00:00+13:00';
    const b = '2026-03-28T18:00:00+13:00';
    expect(sameLocalCalendarDay(a, b, 'Pacific/Auckland')).toBe(true);
    expect(localDateString('2026-06-01T14:00:00Z', 'UTC')).toBe('2026-06-01');
  });

  it('buildUserCalendarContext returns local fields', () => {
    const ctx = buildUserCalendarContext('2026-06-15T02:00:00Z', 'UTC');
    expect(ctx.localDate).toBe('2026-06-15');
    expect(ctx.timezone).toBe('UTC');
  });
});

describe('evidence quality', () => {
  it('does not treat high dependent volume as high confidence', () => {
    const weak = assessEvidenceQuality({
      volume: 12,
      independentCount: 2,
      consistency: 0.4,
      outcomeQuality: 0.5,
    });
    const strong = assessEvidenceQuality({
      volume: 5,
      independentCount: 5,
      consistency: 0.9,
      recency: 0.9,
      outcomeQuality: 0.9,
    });
    expect(strong.strength).toBeGreaterThan(weak.strength);
  });

  it('propagates low identity confidence', () => {
    expect(propagateConfidence('low', 'high')).toBe('low');
    expect(propagateConfidence('high', 'medium')).toBe('medium');
  });
});

describe('multimodal duration', () => {
  it('detects two modes', () => {
    const samples = [25, 30, 28, 240, 300, 270];
    expect(detectDurationModes(samples).length).toBe(2);
    const mm = multimodalDurationFromSamples(samples);
    expect(mm.multimodal).toBe(true);
    expect(mm.warning).toBeTruthy();
  });

  it('stays unimodal for tight samples', () => {
    const mm = multimodalDurationFromSamples([28, 30, 32, 29, 31]);
    expect(mm.multimodal).toBe(false);
  });
});

describe('symmetric calibration', () => {
  it('log ratio is symmetric for 2x over/under', () => {
    const over = logRatio(60, 30)!;
    const under = logRatio(30, 60)!;
    expect(Math.abs(over)).toBeCloseTo(Math.abs(under), 10);
  });

  it('reports bias direction', () => {
    const report = calibrateFromPairs([
      { predictedMins: 30, actualMins: 60 },
      { predictedMins: 30, actualMins: 55 },
      { predictedMins: 30, actualMins: 50 },
      { predictedMins: 30, actualMins: 45 },
    ]);
    expect(report.sampleCount).toBe(4);
    expect(report.medianLogRatio!).toBeGreaterThan(0);
    expect(report.underestimateRate).toBe(1);
  });
});
