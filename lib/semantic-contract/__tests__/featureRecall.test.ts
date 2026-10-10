import { describe, expect, it } from 'vitest';
import { summarizeFeatureRecall, type FeatureRecallCase } from '@/lib/semantic-contract/featureRecall';

describe('positive-label semantic feature recall', () => {
  it('calculates honest coverage and per-domain/per-feature gaps', () => {
    const rows: FeatureRecallCase[] = [
      { id: 'a', domain: 'personal', requiredFeatures: ['action', 'temporal'], observedFeatures: ['action', 'entity'] },
      { id: 'b', domain: 'personal', requiredFeatures: ['negation'], observedFeatures: ['negation'] },
      { id: 'c', domain: 'research', requiredFeatures: ['question'], observedFeatures: [] },
    ];

    expect(summarizeFeatureRecall(rows)).toEqual({
      cases: 3,
      required: 4,
      matched: 2,
      missing: 2,
      recall: 0.5,
      domainCount: 2,
      featureCount: 4,
      byDomain: {
        personal: { cases: 2, required: 3, matched: 2, missing: 1, recall: 2 / 3 },
        research: { cases: 1, required: 1, matched: 0, missing: 1, recall: 0 },
      },
      byFeature: {
        action: { required: 1, matched: 1, missing: 0, recall: 1 },
        negation: { required: 1, matched: 1, missing: 0, recall: 1 },
        question: { required: 1, matched: 0, missing: 1, recall: 0 },
        temporal: { required: 1, matched: 0, missing: 1, recall: 0 },
      },
    });
  });

  it('returns null recall when there are no positive labels', () => {
    expect(summarizeFeatureRecall([])).toMatchObject({
      cases: 0, required: 0, matched: 0, missing: 0, recall: null, domainCount: 0, featureCount: 0,
    });
  });

  it('rejects duplicate case IDs rather than silently double-counting them', () => {
    const row: FeatureRecallCase = { id: 'same', domain: 'personal', requiredFeatures: ['action'], observedFeatures: ['action'] };
    expect(() => summarizeFeatureRecall([row, row])).toThrow('Duplicate feature-recall case id: same');
  });

  it('rejects duplicate required features in a label', () => {
    expect(() => summarizeFeatureRecall([{
      id: 'bad-label', domain: 'personal', requiredFeatures: ['action', 'action'], observedFeatures: ['action'],
    }])).toThrow('contains duplicate required features');
  });

  it('does not count unlabelled observed features as false positives', () => {
    const report = summarizeFeatureRecall([{
      id: 'a', domain: 'personal', requiredFeatures: ['action'], observedFeatures: ['action', 'entity'],
    }]);
    expect(report).toMatchObject({ required: 1, matched: 1, recall: 1 });
    expect(report).not.toHaveProperty('precision');
    expect(report).not.toHaveProperty('falsePositives');
  });
});
