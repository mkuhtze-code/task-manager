import { describe, it, expect } from 'vitest';
import { rankObservation, rankAll } from '../ranking';
import type { StructuredObservation } from '../observations';
import type { Confidence } from '../../types';

function makeObs(over: Partial<StructuredObservation> = {}): StructuredObservation {
  const base: StructuredObservation = {
    id: 'id1',
    type: 'type',
    title: 'title',
    description: 'description',
    evidence: {
      sampleSize: 4, effectMagnitude: 0.5, consistency: 0.9, variance: 1,
      recency: 5, contradictionCount: 0, missingDataCount: 0, specificity: null,
      measurements: [], insufficient: false, evidenceKind: 'observation',
    },
    confidence: 'medium' as Confidence,
    confidenceDimensions: { sampleStrength: 'medium', effectStrength: 'medium', consistencyStrength: 'high' },
    supportingMeasurements: [],
    affectedContext: {},
    createdAt: '2026-01-01T00:00:00Z',
    observationTimestamp: '2026-01-01T00:00:00Z',
    recency: 5,
    staleness: 'current',
    contradictionStatus: 'none',
    traceability: { taskIds: [], taskTexts: [], detectionSource: 'test' },
    semanticType: 'type:x',
    rank: 0,
  };
  return { ...base, ...over };
}

function obsWithEvidence(sampleSize: number, over: Partial<StructuredObservation> = {}): StructuredObservation {
  return makeObs({
    evidence: {
      sampleSize,
      effectMagnitude: 0.5,
      consistency: 0.9,
      variance: 1,
      recency: 5,
      contradictionCount: 0,
      missingDataCount: 0,
      specificity: null,
      measurements: [],
      insufficient: false,
      evidenceKind: 'observation',
    },
    ...over,
  });
}

describe('ranking - stronger evidence ranks higher', () => {
  it('ranks larger sample sizes higher', () => {
    const high = obsWithEvidence(20);
    const low = obsWithEvidence(2);
    expect(rankObservation(high)).toBeGreaterThan(rankObservation(low));
  });

  it('sorts by rank descending', () => {
    const high = obsWithEvidence(20, { id: 'high' });
    const low = obsWithEvidence(1, { id: 'low' });
    const mid = obsWithEvidence(7, { id: 'mid' });
    const result = rankAll([low, high, mid]);
    expect(result.map((o) => o.id)).toEqual(['high', 'mid', 'low']);
  });
});

describe('ranking - effect magnitude matters', () => {
  it('ranks a larger meaningful effect higher, all else equal', () => {
    const bigEffect = makeObs({
      evidence: {
        sampleSize: 10, effectMagnitude: 0.9, consistency: 0.9, variance: 1,
        recency: 5, contradictionCount: 0, missingDataCount: 0, specificity: null,
        measurements: [], insufficient: false, evidenceKind: 'observation',
      },
      id: 'big',
    });
    const smallEffect = makeObs({
      evidence: {
        sampleSize: 10, effectMagnitude: 0.1, consistency: 0.9, variance: 1,
        recency: 5, contradictionCount: 0, missingDataCount: 0, specificity: null,
        measurements: [], insufficient: false, evidenceKind: 'observation',
      },
      id: 'small',
    });
    expect(rankObservation(bigEffect)).toBeGreaterThan(rankObservation(smallEffect));
  });
});

describe('ranking - recency matters', () => {
  it('ranks more recent observations higher', () => {
    const recent = obsWithEvidence(10, { recency: 1 });
    const old = obsWithEvidence(10, { recency: 40 });
    expect(rankObservation(recent)).toBeGreaterThan(rankObservation(old));
  });
});

describe('ranking - contradiction vs staleness', () => {
  it('penalises contradiction more than staleness', () => {
    const contradicted = obsWithEvidence(10, { contradictionStatus: 'full', staleness: 'current' });
    const stale = obsWithEvidence(10, { staleness: 'stale', contradictionStatus: 'none' });
    const clean = obsWithEvidence(10, { contradictionStatus: 'none', staleness: 'current' });
    // Clean ranks above both penalised observations
    expect(rankObservation(clean)).toBeGreaterThan(rankObservation(contradicted));
    expect(rankObservation(clean)).toBeGreaterThan(rankObservation(stale));
    // Contradiction (full, -15) penalises more than staleness (-10)
    expect(rankObservation(contradicted)).toBeLessThan(rankObservation(stale));
  });
});

describe('ranking - deterministic ordering', () => {
  it('produces a deterministic sort (stable tie-break)', () => {
    const a = obsWithEvidence(10, { id: 'a' });
    const b = obsWithEvidence(10, { id: 'b' });
    const r1 = rankAll([b, a]);
    const r2 = rankAll([a, b]);
    expect(r1.map((o) => o.id)).toEqual(r2.map((o) => o.id));
  });

  it('sets the rank field on each observation', () => {
    const obs = obsWithEvidence(10);
    const result = rankAll([obs]);
    expect(result[0].rank).toBeGreaterThan(0);
  });
});
