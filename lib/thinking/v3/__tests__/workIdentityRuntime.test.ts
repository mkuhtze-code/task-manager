import { describe, it, expect, beforeEach } from 'vitest';
import {
  suggestEstimateV3,
  clearPersonalModelCache,
} from '../suggest';
import {
  buildRuntimeObservations,
  lookupTaskSignals,
} from '../../runtimeObservations';
import type { HistoricalTask } from '@/lib/taskIntelligence';

describe('S1 close-out — work leaves in suggest + runtime', () => {
  beforeEach(() => clearPersonalModelCache());

  const history = [
    {
      text: 'Site inspection report Acme',
      actual_mins: 45,
      job_id: 'job-acme',
      completed_at: '2026-01-01T12:00:00Z',
      created_at: '2026-01-01T10:00:00Z',
    },
    {
      text: 'Site inspection report for Acme',
      actual_mins: 50,
      job_id: 'job-acme',
      completed_at: '2026-01-02T12:00:00Z',
      created_at: '2026-01-02T10:00:00Z',
    },
    {
      text: 'Site inspection report Acme',
      actual_mins: 40,
      job_id: 'job-other',
      completed_at: '2026-01-03T12:00:00Z',
      created_at: '2026-01-03T10:00:00Z',
    },
  ];

  it('suggestEstimateV3 uses work identity across title drift same job', () => {
    const s = suggestEstimateV3('Site inspection Acme report', history, {
      context: { jobId: 'job-acme' },
      updatedAt: '2026-01-04T00:00:00Z',
    });
    expect(s).not.toBeNull();
    expect(s!.level).toBe('work');
    expect(s!.sampleCount).toBeGreaterThanOrEqual(2);
    // Should lean toward ~45-50, not the other-job 40 alone
    expect(s!.suggestedMins).toBeGreaterThanOrEqual(40);
  });

  it('different job does not inherit Acme leaf', () => {
    const s = suggestEstimateV3('Site inspection report Acme', history, {
      context: { jobId: 'job-brand-new' },
      updatedAt: '2026-01-04T00:00:00Z',
    });
    // No work leaf with 2 samples for brand-new job — may fall back to text cluster
    if (s?.level === 'work') {
      expect(s.sampleCount).toBeLessThan(2);
    }
  });

  it('runtime workLeaves expose matched workKey with job context', () => {
    const rt = buildRuntimeObservations(history as HistoricalTask[], {
      updatedAt: '2026-01-04T00:00:00Z',
    });
    expect(rt.workLeaves.length).toBeGreaterThanOrEqual(2);
    const signals = lookupTaskSignals('Site inspection report for Acme', rt, {
      jobId: 'job-acme',
    });
    expect(signals.workKey).not.toBeNull();
    expect(signals.workLeaf).not.toBeNull();
    expect(signals.explainDuration).toMatch(/on this work/);
  });
});

