import { describe, it, expect } from 'vitest';
import {
  rankActionableObservations,
  formatObservationLine,
} from '@/lib/thinking/actionableObservations';
import type { StructuredObservation } from '@/lib/thinking/v2/observations';

function obs(
  partial: Partial<StructuredObservation> & { type: string }
): StructuredObservation {
  return {
    id: partial.id ?? '1',
    type: partial.type,
    title: partial.title ?? 'Title',
    description: partial.description ?? 'Desc',
    evidence: (partial.evidence ?? {
      sampleSize: 5,
      magnitude: 0.5,
      consistency: 0.7,
      variance: 1,
      specificity: 0.5,
      recency: 1,
    }) as StructuredObservation['evidence'],
    confidence: partial.confidence ?? 'medium',
    confidenceDimensions: (partial.confidenceDimensions ?? {
      sample: 0.5,
      magnitude: 0.5,
      consistency: 0.5,
      variance: 0.5,
      specificity: 0.5,
      recency: 0.5,
    }) as StructuredObservation['confidenceDimensions'],
    supportingMeasurements: [],
    affectedContext: {},
    createdAt: new Date().toISOString(),
    observationTimestamp: new Date().toISOString(),
    recency: 1,
    staleness: partial.staleness ?? 'current',
    contradictionStatus: 'none',
    traceability: { taskIds: [], taskTexts: [], detectionSource: 'test' },
    semanticType: partial.semanticType ?? partial.type,
    rank: partial.rank ?? 10,
  };
}

describe('rankActionableObservations', () => {
  it('prefers carry and estimate over weaker types', () => {
    const list = rankActionableObservations([
      obs({ type: 'generic_note', title: 'Note', rank: 50 }),
      obs({ type: 'repeated_carryover', title: 'Often carried', rank: 10, confidence: 'high' }),
      obs({ type: 'estimate_calibration', title: 'Runs long', rank: 12 }),
    ]);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].type).toMatch(/carry|estimate/i);
  });

  it('respects limit', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      obs({ type: 'cluster', id: String(i), title: `C${i}`, rank: i })
    );
    expect(rankActionableObservations(many, 3)).toHaveLength(3);
  });

  it('formatObservationLine truncates', () => {
    const line = formatObservationLine(
      obs({ type: 'cluster', title: 'A'.repeat(100) }),
      40
    );
    expect(line.length).toBeLessThanOrEqual(40);
  });
});
