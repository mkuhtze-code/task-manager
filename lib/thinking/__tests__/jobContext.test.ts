import { describe, it, expect } from 'vitest';
import { decideJobContext } from '../decisions/jobContext';
import type { CompletedTaskFacts, JobContextDecision } from '../types';
import type { ClusterJobAssociation } from '../associations/types';

function task(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'Task A',
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 25,
    logged_mins: 25,
    created_at: '2025-01-13T09:00:00Z',
    completed_at: '2025-01-13T09:25:00Z',
    started_at: '2025-01-13T09:00:00Z',
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...overrides,
  };
}

function association(overrides: Partial<ClusterJobAssociation> = {}): ClusterJobAssociation {
  return {
    kind: 'cluster_job',
    clusterLabel: 'site visit oakwood',
    jobId: 'job-oakwood-1',
    evidence: {
      direct: { count: 0, total: 10 },
      spatial: { count: 0, total: 5 },
      temporal: { count: 0, total: 5 },
      sequence: { count: 0, total: 5 },
    },
    confidence: 'low',
    ...overrides,
  };
}

describe('decideJobContext', () => {
  describe('null-return conditions', () => {
    it('returns null when task already has a job_id', () => {
      const t = task({ job_id: 'job-oakwood-1' });
      const result = decideJobContext(t, [t], []);
      expect(result).toBeNull();
    });

    it('returns null when there are no associations', () => {
      const t = task();
      const result = decideJobContext(t, [t], []);
      expect(result).toBeNull();
    });

    it('returns null when single association has no evidence', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when only spatial evidence exists (single dimension)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when only temporal evidence exists (single dimension)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when only sequence evidence exists (single dimension)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 3, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when spatial count is below threshold', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 1, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when temporal count is below threshold', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 1, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });
  });

  describe('direct evidence path', () => {
    it('returns decision when direct evidence exists', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 4, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('job_context');
      expect(result!.jobId).toBe('job-oakwood-1');
      expect(result!.agreeingDimensions).toContain('direct');
    });

    it('derives confidence from direct count', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 8, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result!.confidence).toBe('high');
    });

    it('includes other agreeing dimensions in the decision', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 3, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 2, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result!.agreeingDimensions).toContain('direct');
      expect(result!.agreeingDimensions).toContain('spatial');
      expect(result!.agreeingDimensions).toContain('temporal');
      expect(result!.agreeingDimensions).not.toContain('sequence');
    });
  });

  describe('multi-dimensional agreement', () => {
    it('accepts when spatial + temporal agree', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.agreeingDimensions).toContain('spatial');
      expect(result!.agreeingDimensions).toContain('temporal');
    });

    it('accepts when spatial + sequence agree', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 3, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.agreeingDimensions).toContain('spatial');
      expect(result!.agreeingDimensions).toContain('sequence');
    });

    it('accepts when temporal + sequence agree', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 3, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.agreeingDimensions).toContain('temporal');
      expect(result!.agreeingDimensions).toContain('sequence');
    });

    it('accepts when all three contextual dimensions agree', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 2, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.agreeingDimensions).toHaveLength(3);
    });

    it('derives confidence from strongest agreeing dimension', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 8, total: 10 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result!.confidence).toBe('high'); // from spatial count 8
    });
  });

  describe('threshold boundaries', () => {
    it('accepts exactly at spatial threshold (2)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 2, total: 5 },
          temporal: { count: 2, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
    });

    it('rejects one below spatial threshold (1)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 1, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('rejects one below temporal threshold (1)', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 1, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });
  });

  describe('conflicting evidence', () => {
    it('returns null when two candidates both qualify', () => {
      const t = task();
      const a1 = association({
        jobId: 'job-oakwood-1',
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const a2 = association({
        jobId: 'job-birch-3',
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a1, a2]);
      expect(result).toBeNull();
    });

    it('returns null when one candidate qualifies but another has any evidence', () => {
      // Only one qualifies, but there are two candidates
      // The qualified one should be returned (single winner)
      const t = task();
      const a1 = association({
        jobId: 'job-oakwood-1',
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const a2 = association({
        jobId: 'job-birch-3',
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 1, total: 5 },
          temporal: { count: 0, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a1, a2]);
      expect(result).not.toBeNull();
      expect(result!.jobId).toBe('job-oakwood-1');
    });
  });

  describe('evidence independence', () => {
    it('changing spatial does not affect temporal evaluation', () => {
      const t = task();
      const base = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 0, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      // With spatial = 0, only temporal → single dimension → null
      expect(decideJobContext(t, [t], [base])).toBeNull();

      // Add spatial → now two dimensions agree → should produce decision
      const withSpatial = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      expect(decideJobContext(t, [t], [withSpatial])).not.toBeNull();
    });
  });

  describe('user override', () => {
    it('returns null for task with existing job_id', () => {
      const t = task({ job_id: 'job-oakwood-1' });
      const a = association({
        evidence: {
          direct: { count: 5, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).toBeNull();
    });
  });

  describe('determinism', () => {
    it('same input always yields same output', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 2, total: 5 },
        },
      });
      const r1 = decideJobContext(t, [t], [a]);
      const r2 = decideJobContext(t, [t], [a]);
      expect(r1).toEqual(r2);
    });
  });

  describe('no mutation', () => {
    it('does not modify input facts or associations', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 3, total: 5 },
          temporal: { count: 3, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const tBefore = JSON.parse(JSON.stringify(t));
      const aBefore = JSON.parse(JSON.stringify(a));

      decideJobContext(t, [t], [a]);

      expect(t).toEqual(tBefore);
      expect(a).toEqual(aBefore);
    });
  });

  describe('cold-start / authority', () => {
    it('does not produce strong authority from low evidence', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 2, total: 5 },
          temporal: { count: 2, total: 5 },
          sequence: { count: 0, total: 5 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result).not.toBeNull();
      expect(result!.authority).not.toBe('strong');
    });

    it('produces strong authority from high evidence', () => {
      const t = task();
      const a = association({
        evidence: {
          direct: { count: 0, total: 10 },
          spatial: { count: 8, total: 10 },
          temporal: { count: 8, total: 10 },
          sequence: { count: 8, total: 10 },
        },
      });
      const result = decideJobContext(t, [t], [a]);
      expect(result!.authority).toBe('strong');
    });
  });
});
