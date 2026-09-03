import { describe, it, expect } from 'vitest';
import { deduplicateObservations } from '../dedup';
import type { StructuredObservation } from '../observations';
import type { Confidence } from '../../types';

function makeObs(over: Partial<StructuredObservation> = {}): StructuredObservation {
  const base: StructuredObservation = {
    id: 'abc123',
    type: 'time_of_day',
    title: 'title',
    description: 'description',
    evidence: {
      sampleSize: 4,
      effectMagnitude: 0.5,
      consistency: 0.9,
      variance: 1,
      recency: 2,
      contradictionCount: 0,
      missingDataCount: 0,
      specificity: null,
      measurements: [],
      insufficient: false,
      evidenceKind: 'observation',
    },
    confidence: 'medium' as Confidence,
    confidenceDimensions: { sampleStrength: 'medium', effectStrength: 'medium', consistencyStrength: 'high' },
    supportingMeasurements: [],
    affectedContext: {},
    createdAt: '2026-01-01T00:00:00Z',
    observationTimestamp: '2026-01-01T00:00:00Z',
    recency: 2,
    staleness: 'current',
    contradictionStatus: 'none',
    traceability: { taskIds: [], taskTexts: [], detectionSource: 'test' },
    semanticType: 'time_of_day:morning',
    rank: 0,
  };
  return { ...base, ...over };
}

describe('dedup - equivalent observations collapse', () => {
  it('keeps a single observation for matching semantics', () => {
    const obs1 = makeObs({ id: 'same-id', semanticType: 'time_of_day:morning' });
    const obs2 = makeObs({ id: 'same-id', semanticType: 'time_of_day:morning' });
    const result = deduplicateObservations([obs1, obs2]);
    expect(result).toHaveLength(1);
  });
});

describe('dedup - keeps strongest evidence', () => {
  it('keeps the observation with stronger evidence on collision', () => {
    const weak = makeObs({
      id: 'same-id',
      type: 'estimate_calibration',
      semanticType: 'estimate_calibration:over',
      evidence: {
        sampleSize: 4, effectMagnitude: 0.5, consistency: 0.9, variance: 1,
        recency: 2, contradictionCount: 0, missingDataCount: 0, specificity: null,
        measurements: [], insufficient: false, evidenceKind: 'observation',
      },
    });
    const strong = makeObs({
      id: 'same-id',
      type: 'estimate_calibration',
      semanticType: 'estimate_calibration:over',
      evidence: {
        sampleSize: 12, effectMagnitude: 0.5, consistency: 0.9, variance: 1,
        recency: 2, contradictionCount: 0, missingDataCount: 0, specificity: null,
        measurements: [], insufficient: false, evidenceKind: 'observation',
      },
    });
    const result = deduplicateObservations([weak, strong]);
    expect(result).toHaveLength(1);
    expect(result[0].evidence.sampleSize).toBe(12);
  });
});

describe('dedup - distinct observations remain distinct', () => {
  it('keeps distinct semantics separate', () => {
    const a = makeObs({ id: 'id-a', type: 'time_of_day', semanticType: 'time_of_day:morning' });
    const b = makeObs({ id: 'id-b', type: 'estimate_calibration', semanticType: 'estimate_calibration:over' });
    const result = deduplicateObservations([a, b]);
    expect(result).toHaveLength(2);
  });

  it('keeps different periods of the same type separate', () => {
    const m = makeObs({ id: 'id-m', semanticType: 'time_of_day:morning' });
    const e = makeObs({ id: 'id-e', semanticType: 'time_of_day:evening' });
    const result = deduplicateObservations([m, e]);
    expect(result).toHaveLength(2);
  });

  it('returns empty for empty input', () => {
    expect(deduplicateObservations([])).toEqual([]);
  });
});
