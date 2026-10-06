import { describe, expect, it } from 'vitest';
import { rankOpportunities, selectSurfaceOpportunity } from '../reconcile/opportunityRanker';

const opportunity = (overrides = {}) => ({
  kind: 'job' as const,
  message: 'The location matches the job.',
  confidence: 'high' as const,
  entityIds: ['job-1'],
  reason: 'job_location_convergence',
  ...overrides,
});

describe('Dokkit CPU Phase 9 — opportunity ranking', () => {
  it('surfaces high-confidence, high-value opportunities', () => {
    const ranked = rankOpportunities([opportunity()]);
    expect(ranked[0].score).toBe(95);
    expect(ranked[0].disposition).toBe('surface');
    expect(selectSurfaceOpportunity(ranked)?.reason).toBe('job_location_convergence');
  });

  it('keeps medium-confidence opportunities as suggestions rather than interruptions', () => {
    const ranked = rankOpportunities([
      opportunity({ confidence: 'medium', kind: 'spatial' }),
    ]);
    expect(ranked[0].score).toBe(60);
    expect(ranked[0].disposition).toBe('retain');
  });

  it('ranks stronger opportunities first', () => {
    const ranked = rankOpportunities([
      opportunity({ confidence: 'medium', kind: 'memory' }),
      opportunity({ confidence: 'high', kind: 'job' }),
      opportunity({ confidence: 'medium', kind: 'dependency' }),
    ]);
    expect(ranked[0].kind).toBe('job');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('does not mutate the opportunity or execute anything', () => {
    const input = opportunity();
    const copy = JSON.parse(JSON.stringify(input));
    rankOpportunities([input]);
    expect(input).toEqual(copy);
  });
});
