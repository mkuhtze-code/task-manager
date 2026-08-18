import { describe, it, expect } from 'vitest';
import type { CompletedTaskFacts } from '../types';
import { findClusterTimeAssociations } from '../associations/clusterTime';

function makeTask(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text: 'Test task',
    status: 'done',
    source: 'planned',
    estimate_mins: 60,
    actual_mins: 60,
    logged_mins: 60,
    created_at: '2026-03-15T10:00:00Z',
    completed_at: '2026-03-15T11:00:00Z',
    started_at: '2026-03-15T10:00:00Z',
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

describe('findClusterTimeAssociations', () => {
  describe('period dimension', () => {
    it('3/3 same period → association', () => {
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T09:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const periodAssocs = assocs.filter((a) => a.dimension === 'period');
      expect(periodAssocs).toHaveLength(1);
      expect(periodAssocs[0].value).toBe('morning');
      expect(periodAssocs[0].occurrenceCount).toBe(3);
      expect(periodAssocs[0].ratio).toBe(1);
    });

    it('2/3 same period → no association (ratio 67% but below threshold on 2 observations)', () => {
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T14:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      // 2/3 = 66.7%, which is >= 60% threshold, so this SHOULD produce an association
      const periodAssocs = assocs.filter((a) => a.dimension === 'period');
      expect(periodAssocs).toHaveLength(1);
      expect(periodAssocs[0].value).toBe('morning');
    });

    it('1/3 same period → no association', () => {
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T14:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T19:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const periodAssocs = assocs.filter((a) => a.dimension === 'period');
      expect(periodAssocs).toHaveLength(0);
    });

    it('exactly 60% threshold → association', () => {
      // 3/5 = 60%
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'D', created_at: '2026-03-15T14:00:00Z' }),
        makeTask({ text: 'E', created_at: '2026-03-15T19:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const morning = assocs.filter(
        (a) => a.dimension === 'period' && a.value === 'morning'
      );
      expect(morning).toHaveLength(1);
      expect(morning[0].ratio).toBeCloseTo(0.6);
    });

    it('just below 60% → no association', () => {
      // 2/5 = 40% (not 3/5)
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T14:00:00Z' }),
        makeTask({ text: 'D', created_at: '2026-03-15T15:00:00Z' }),
        makeTask({ text: 'E', created_at: '2026-03-15T19:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const morning = assocs.filter(
        (a) => a.dimension === 'period' && a.value === 'morning'
      );
      expect(morning).toHaveLength(0);
    });
  });

  describe('day_of_week dimension', () => {
    it('all tasks on same day of week → association', () => {
      // All on Monday 2026-03-09
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-09T08:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-09T10:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-09T14:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const dowAssocs = assocs.filter((a) => a.dimension === 'day_of_week');
      expect(dowAssocs).toHaveLength(1);
      expect(dowAssocs[0].value).toBe('Mon');
      expect(dowAssocs[0].ratio).toBe(1);
    });

    it('mixed days, one dominant → association if above threshold', () => {
      // 4 Mon, 1 Tue = 80% Mon
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-09T08:00:00Z' }), // Mon
        makeTask({ text: 'B', created_at: '2026-03-16T08:00:00Z' }), // Mon
        makeTask({ text: 'C', created_at: '2026-03-23T08:00:00Z' }), // Mon
        makeTask({ text: 'D', created_at: '2026-03-30T08:00:00Z' }), // Mon
        makeTask({ text: 'E', created_at: '2026-03-10T08:00:00Z' }), // Tue
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const dowAssocs = assocs.filter((a) => a.dimension === 'day_of_week');
      expect(dowAssocs.length).toBeGreaterThanOrEqual(1);
      const monAssoc = dowAssocs.find((a) => a.value === 'Mon');
      expect(monAssoc).toBeDefined();
      expect(monAssoc!.ratio).toBeCloseTo(0.8);
    });
  });

  describe('missing and invalid data', () => {
    it('tasks without created_at excluded from temporal analysis', () => {
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'D', created_at: '' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const periodAssocs = assocs.filter((a) => a.dimension === 'period');
      expect(periodAssocs).toHaveLength(1);
      expect(periodAssocs[0].totalWithTimestamp).toBe(3);
      expect(periodAssocs[0].totalInCluster).toBe(4);
    });

    it('all invalid timestamps → no associations', () => {
      const tasks = [
        makeTask({ text: 'A', created_at: '' }),
        makeTask({ text: 'B', created_at: '' }),
        makeTask({ text: 'C', created_at: '' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });

    it('empty array → no associations', () => {
      expect(findClusterTimeAssociations('test', [])).toHaveLength(0);
    });

    it('single task → no associations', () => {
      const tasks = [makeTask({ text: 'A', created_at: '2026-03-15T08:00:00Z' })];
      expect(findClusterTimeAssociations('test', tasks)).toHaveLength(0);
    });
  });

  describe('periods are independent', () => {
    it('independent periods evaluated separately → one above threshold produces one association', () => {
      // 5 morning, 3 afternoon, 1 evening = 9 total
      // morning: 5/9 = 55.6% — below 60%. Need more morning.
      // 6 morning, 2 afternoon, 1 evening = 9 total
      // morning: 6/9 = 66.7% — above 60%
      // afternoon: 2/9 = 22.2% — below
      const tasks = [
        makeTask({ text: 'A', created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'B', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'C', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'D', created_at: '2026-03-15T06:30:00Z' }),
        makeTask({ text: 'E', created_at: '2026-03-15T07:30:00Z' }),
        makeTask({ text: 'F', created_at: '2026-03-15T08:30:00Z' }),
        makeTask({ text: 'G', created_at: '2026-03-15T14:00:00Z' }),
        makeTask({ text: 'H', created_at: '2026-03-15T15:00:00Z' }),
        makeTask({ text: 'I', created_at: '2026-03-15T19:00:00Z' }),
      ];
      const assocs = findClusterTimeAssociations('test', tasks);
      const periodAssocs = assocs.filter((a) => a.dimension === 'period');
      expect(periodAssocs).toHaveLength(1);
      expect(periodAssocs[0].value).toBe('morning');
    });
  });
});
