import { describe, it, expect } from 'vitest';
import type { CompletedTaskFacts } from '../types';
import { findClusterJobAssociations } from '../associations/clusterJob';

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

const HOME = { lat: 52.4862, lng: -1.8904 };
const SITE = { lat: 52.4521, lng: -1.7434 };

describe('findClusterJobAssociations', () => {
  describe('direct evidence', () => {
    it('tasks with job_id provide direct evidence', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: 'job-1', created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: 'job-1', created_at: '2026-03-15T11:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].jobId).toBe('job-1');
      expect(assocs[0].evidence.direct.count).toBe(4);
      expect(assocs[0].evidence.direct.total).toBe(4);
    });

    it('no job_id anywhere → no associations', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: null, created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: null, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: null, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: null, created_at: '2026-03-15T11:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });
  });

  describe('spatial evidence', () => {
    it('unlinked tasks near job location provide spatial evidence', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: null, lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: null, lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T11:00:00Z' }),
        makeTask({ text: 'E', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-15T12:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      // 2 unlinked tasks near job location (C, D), 1 far (E), out of 3 unlinked with coords
      expect(assocs[0].evidence.spatial.count).toBe(2);
      expect(assocs[0].evidence.spatial.total).toBe(3);
    });

    it('unlinked tasks far from job location → no spatial evidence', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-15T11:00:00Z' }),
        makeTask({ text: 'E', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-15T12:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      // Has direct evidence, but no spatial evidence for unlinked tasks
      expect(assocs).toHaveLength(1);
      expect(assocs[0].evidence.spatial.count).toBe(0);
    });
  });

  describe('temporal evidence', () => {
    it('unlinked tasks on same day as job activity provide temporal evidence', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: null, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: null, created_at: '2026-03-15T11:00:00Z' }),
        makeTask({ text: 'E', job_id: null, created_at: '2026-03-16T10:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      // C and D are on same day as job activity, E is on different day
      expect(assocs[0].evidence.temporal.count).toBe(2);
      expect(assocs[0].evidence.temporal.total).toBe(3);
    });
  });

  describe('sequence evidence', () => {
    it('unlinked tasks adjacent to job tasks provide sequence evidence', () => {
      const tasks = [
        makeTask({ text: 'Material run', job_id: null, created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'Site visit', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'Quote work', job_id: null, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'Admin', job_id: null, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'Unrelated', job_id: null, created_at: '2026-03-15T14:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      // "Material run" precedes "Site visit", "Quote work" follows "Site visit"
      expect(assocs[0].evidence.sequence.count).toBe(2);
      expect(assocs[0].evidence.sequence.total).toBe(4);
    });
  });

  describe('multi-dimension single task (no double-counting)', () => {
    it('one task satisfying spatial + temporal + sequence counts as 1 in each dimension', () => {
      const tasks = [
        makeTask({ text: 'Job work A', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'Job work B', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'Unlinked task', job_id: null, lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'Another unlinked', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-16T10:00:00Z' }),
        makeTask({ text: 'Third unlinked', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-17T10:00:00Z' }),
        makeTask({ text: 'Fourth unlinked', job_id: null, lat: HOME.lat, lng: HOME.lng, created_at: '2026-03-18T10:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);

      const e = assocs[0].evidence;
      expect(e.spatial.count).toBe(1);
      expect(e.temporal.count).toBe(1);
      expect(e.sequence.count).toBe(1);

      // spatial total = unlinked with coords = 4
      expect(e.spatial.total).toBe(4);
      // temporal total = unlinked with timestamps = 4
      expect(e.temporal.total).toBe(4);
      // sequence total = unlinked with timestamps = 4
      expect(e.sequence.total).toBe(4);
    });
  });

  describe('multiple jobs', () => {
    it('cluster with tasks for two jobs produces two associations', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: 'job-1', created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: 'job-1', created_at: '2026-03-15T11:00:00Z' }),
        makeTask({ text: 'E', job_id: 'job-2', created_at: '2026-03-16T08:00:00Z' }),
        makeTask({ text: 'F', job_id: 'job-2', created_at: '2026-03-16T09:00:00Z' }),
        makeTask({ text: 'G', job_id: 'job-2', created_at: '2026-03-16T10:00:00Z' }),
        makeTask({ text: 'H', job_id: 'job-2', created_at: '2026-03-16T11:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(2);
      expect(assocs.map((a) => a.jobId)).toContain('job-1');
      expect(assocs.map((a) => a.jobId)).toContain('job-2');
    });
  });

  describe('edge cases', () => {
    it('fewer than 4 tasks → no associations', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: 'job-1', created_at: '2026-03-15T10:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });

    it('job-linked tasks only, no unlinked → direct evidence only', () => {
      const tasks = [
        makeTask({ text: 'A', job_id: 'job-1', created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'B', job_id: 'job-1', created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'C', job_id: 'job-1', created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'D', job_id: 'job-1', created_at: '2026-03-15T11:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].evidence.direct.count).toBe(4);
      expect(assocs[0].evidence.spatial.count).toBe(0);
      expect(assocs[0].evidence.temporal.count).toBe(0);
      expect(assocs[0].evidence.sequence.count).toBe(0);
    });

    it('empty array → no associations', () => {
      expect(findClusterJobAssociations('test', [])).toHaveLength(0);
    });

    it('personal task at job location with no job_id → no job association from that task alone', () => {
      // Personal task at job site coordinates, but no job_id
      // The association exists because of the LINKED tasks, not this one
      const tasks = [
        makeTask({ text: 'School run', job_id: null, lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T07:00:00Z' }),
        makeTask({ text: 'Job work A', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T08:00:00Z' }),
        makeTask({ text: 'Job work B', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T09:00:00Z' }),
        makeTask({ text: 'Job work C', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T10:00:00Z' }),
        makeTask({ text: 'Job work D', job_id: 'job-1', lat: SITE.lat, lng: SITE.lng, created_at: '2026-03-15T11:00:00Z' }),
      ];
      const assocs = findClusterJobAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      // School run provides spatial evidence (near job site) + temporal (same day) + sequence (adjacent)
      // But we do NOT conclude "school run belongs to job-1"
      expect(assocs[0].evidence.spatial.count).toBe(1);
      expect(assocs[0].evidence.temporal.count).toBe(1);
      expect(assocs[0].evidence.sequence.count).toBe(1);
    });
  });
});
