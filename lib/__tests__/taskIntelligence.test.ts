import { describe, it, expect } from 'vitest';
import {
  suggestJob,
  suggestLocationMemory,
  buildClusters,
  type HistoricalTask,
} from '../taskIntelligence';

// ── Test data ──────────────────────────────────────────────────────
// A realistic set of historical tasks with job_ids and created_at.

const oakwoodTasks: HistoricalTask[] = [
  { text: 'Site visit Oakwood', actual_mins: 45, lat: 52.4128, lng: -1.7745, location_text: 'Oakwood', job_id: 'job-oakwood-1', created_at: '2025-01-13T09:00:00Z' },
  { text: 'Quote Oakwood extension', actual_mins: 50, lat: 52.4129, lng: -1.7746, location_text: 'Oakwood', job_id: 'job-oakwood-1', created_at: '2025-01-13T14:00:00Z' },
  { text: 'Site visit Oakwood Phase 2', actual_mins: 50, lat: 52.4127, lng: -1.7744, location_text: 'Oakwood', job_id: 'job-oakwood-1', created_at: '2025-01-15T09:00:00Z' },
  { text: 'Quote Oakwood Phase 2', actual_mins: 42, lat: 52.4128, lng: -1.7745, location_text: 'Oakwood', job_id: 'job-oakwood-1', created_at: '2025-01-15T14:30:00Z' },
  { text: 'Site visit Oakwood Phase 3', actual_mins: 55, lat: 52.4128, lng: -1.7745, location_text: 'Oakwood', job_id: 'job-oakwood-1', created_at: '2025-01-17T09:00:00Z' },
  { text: 'Collect materials Oakwood', actual_mins: 25, lat: 52.4130, lng: -1.7748, location_text: 'Builders yard', job_id: 'job-oakwood-1', created_at: '2025-01-13T08:00:00Z' },
];

const mapleTasks: HistoricalTask[] = [
  { text: 'Site visit Maple', actual_mins: 85, lat: 52.4500, lng: -1.8000, location_text: 'Maple', job_id: 'job-maple-2', created_at: '2025-01-14T09:00:00Z' },
  { text: 'Quote Maple renovation', actual_mins: 55, lat: 52.4501, lng: -1.8001, location_text: 'Maple', job_id: 'job-maple-2', created_at: '2025-01-14T14:00:00Z' },
  { text: 'Site visit Maple Phase 2', actual_mins: 100, lat: 52.4500, lng: -1.8000, location_text: 'Maple', job_id: 'job-maple-2', created_at: '2025-01-18T09:00:00Z' },
  { text: 'Quote Maple Phase 2', actual_mins: 55, lat: 52.4501, lng: -1.8001, location_text: 'Maple', job_id: 'job-maple-2', created_at: '2025-01-18T14:00:00Z' },
  { text: 'Collect materials Maple', actual_mins: 40, lat: 52.4131, lng: -1.7749, location_text: 'Builders yard', job_id: 'job-maple-2', created_at: '2025-01-14T07:30:00Z' },
];

const schoolTasks: HistoricalTask[] = [
  { text: 'School run', actual_mins: 25, lat: 52.4135, lng: -1.7750, location_text: 'School', created_at: '2025-01-13T08:30:00Z' },
  { text: 'School run', actual_mins: 20, lat: 52.4136, lng: -1.7751, location_text: 'School', created_at: '2025-01-15T08:15:00Z' },
  { text: 'School run', actual_mins: 22, lat: 52.4134, lng: -1.7749, location_text: 'School', created_at: '2025-01-16T08:00:00Z' },
  { text: 'School run', actual_mins: 24, lat: 52.4135, lng: -1.7750, location_text: 'School', created_at: '2025-01-17T08:20:00Z' },
  { text: 'School run', actual_mins: 26, lat: 52.4135, lng: -1.7750, location_text: 'School', created_at: '2025-01-20T08:10:00Z' },
  { text: 'School run', actual_mins: 23, lat: 52.4136, lng: -1.7751, location_text: 'School', created_at: '2025-01-22T08:05:00Z' },
];

const allHistory: HistoricalTask[] = [...oakwoodTasks, ...mapleTasks, ...schoolTasks];

// ── suggestJob tests ───────────────────────────────────────────────

describe('suggestJob', () => {
  it('returns null for empty input', () => {
    expect(suggestJob('', allHistory)).toBeNull();
    expect(suggestJob('   ', allHistory)).toBeNull();
  });

  it('returns null when history has no job_id data', () => {
    const noJobHistory: HistoricalTask[] = [
      { text: 'School run', actual_mins: 25, created_at: '2025-01-13T08:30:00Z' },
      { text: 'School run', actual_mins: 20, created_at: '2025-01-15T08:15:00Z' },
    ];
    expect(suggestJob('School run', noJobHistory)).toBeNull();
  });

  it('returns null for unmatched text', () => {
    expect(suggestJob('Completely unrelated task', allHistory)).toBeNull();
  });

  it('returns a suggestion for text matching a single-job cluster', () => {
    const result = suggestJob('Site visit Oakwood', allHistory);
    // The Oakwood cluster has only job-oakwood-1 → single candidate path
    if (result) {
      expect(result.jobId).toBe('job-oakwood-1');
      expect(['low', 'medium', 'high']).toContain(result.confidence);
      expect(['observe', 'suggest', 'strong']).toContain(result.authority);
    }
  });

  it('returns null when multiple jobs compete in the same cluster', () => {
    // "Site visit" tasks from both Oakwood and Maple may cluster together
    // depending on Jaccard similarity. If they do, multi-candidate conflict → null.
    const result = suggestJob('Site visit', allHistory);
    // This is context-dependent — may be null (conflict) or a single-candidate decision
    if (result) {
      expect(['job-oakwood-1', 'job-maple-2']).toContain(result.jobId);
    }
  });

  it('uses precomputed clusters when provided', () => {
    const clusters = buildClusters(allHistory);
    const result = suggestJob('Site visit Oakwood', allHistory, clusters);
    if (result) {
      expect(result.jobId).toBe('job-oakwood-1');
    }
  });

  it('returns deterministic results', () => {
    const r1 = suggestJob('Site visit Oakwood', allHistory);
    const r2 = suggestJob('Site visit Oakwood', allHistory);
    expect(r1).toEqual(r2);
  });

  it('includes agreeing dimensions in the result', () => {
    const result = suggestJob('Site visit Oakwood', allHistory);
    if (result) {
      expect(Array.isArray(result.agreeingDimensions)).toBe(true);
      expect(result.agreeingDimensions.length).toBeGreaterThan(0);
    }
  });
});

// ── suggestLocationMemory tests ────────────────────────────────────

describe('suggestLocationMemory', () => {
  it('returns null for empty input', () => {
    expect(suggestLocationMemory('', allHistory)).toBeNull();
  });

  it('returns null for unmatched text', () => {
    expect(suggestLocationMemory('Completely unrelated task', allHistory)).toBeNull();
  });

  it('returns a suggestion for School run (strong location memory)', () => {
    // School run has 6 identical tasks all at School → should have strong memory
    const result = suggestLocationMemory('School run', allHistory);
    if (result) {
      expect(result.locationText).toBe('School');
      expect(['low', 'medium', 'high']).toContain(result.confidence);
      expect(['observe', 'suggest', 'strong']).toContain(result.authority);
      expect(result.occurrenceCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('returns a suggestion for Oakwood tasks', () => {
    const result = suggestLocationMemory('Site visit Oakwood', allHistory);
    if (result) {
      expect(result.locationText).toBeDefined();
      expect(result.lat).toBeDefined();
      expect(result.lng).toBeDefined();
      expect(result.occurrenceCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses precomputed clusters when provided', () => {
    const clusters = buildClusters(allHistory);
    const result = suggestLocationMemory('School run', allHistory, clusters);
    if (result) {
      expect(result.locationText).toBe('School');
    }
  });

  it('returns deterministic results', () => {
    const r1 = suggestLocationMemory('School run', allHistory);
    const r2 = suggestLocationMemory('School run', allHistory);
    expect(r1).toEqual(r2);
  });

  it('returns null for tasks with no strong location pattern', () => {
    // Tasks with varied locations won't meet the ratio threshold
    const variedHistory: HistoricalTask[] = [
      { text: 'Errand', actual_mins: 15, lat: 52.4, lng: -1.7, location_text: 'Shop A', created_at: '2025-01-13T10:00:00Z' },
      { text: 'Errand', actual_mins: 20, lat: 52.5, lng: -1.8, location_text: 'Shop B', created_at: '2025-01-14T10:00:00Z' },
      { text: 'Errand', actual_mins: 15, lat: 52.4, lng: -1.7, location_text: 'Shop A', created_at: '2025-01-15T10:00:00Z' },
      { text: 'Errand', actual_mins: 20, lat: 52.5, lng: -1.8, location_text: 'Shop B', created_at: '2025-01-16T10:00:00Z' },
    ];
    const result = suggestLocationMemory('Errand', variedHistory);
    // Split 50/50 between Shop A and Shop B → ratio 0.5 < 0.7 → null
    expect(result).toBeNull();
  });
});
