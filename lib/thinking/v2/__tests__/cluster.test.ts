import { describe, it, expect } from 'vitest';
import { observeV2Clusters } from '../cluster';
import { buildClusterGroups } from '../clusterGroups';
import type { CompletedTaskFacts } from '../../types';

function makeTask(text: string, over: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return {
    text,
    status: 'done',
    source: 'planned',
    estimate_mins: 30,
    actual_mins: 30,
    logged_mins: 0,
    created_at: '2026-01-14T10:00:00Z',
    completed_at: '2026-01-14T11:00:00Z',
    started_at: null,
    surface_date: null,
    location_text: null,
    lat: null,
    lng: null,
    job_id: null,
    info: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskTotalMins: 0,
    ...over,
  };
}

describe('cluster - light clustering', () => {
  it('groups tasks by shared content tokens deterministically', () => {
    const tasks = [
      makeTask('File taxes'),
      makeTask('File taxes'),
      makeTask('File taxes'),
      makeTask('Buy groceries'),
    ];
    const groups = buildClusterGroups(tasks);
    const taxes = groups.find((g) => g.label === 'File taxes');
    expect(taxes?.tasks.length).toBe(3);
  });
});

describe('cluster - duration observation', () => {
  it('emits a duration observation for a recurring cluster with a distinct median', () => {
    const tasks = [
      makeTask('File taxes', { actual_mins: 40 }),
      makeTask('File taxes', { actual_mins: 42 }),
      makeTask('File taxes', { actual_mins: 38 }),
      makeTask('File taxes', { actual_mins: 40 }),
      // different cluster with a clearly shorter duration
      makeTask('Quick errand', { actual_mins: 10 }),
      makeTask('Quick errand', { actual_mins: 12 }),
      makeTask('Quick errand', { actual_mins: 11 }),
    ];
    const obs = observeV2Clusters(tasks);
    const duration = obs.find((o) => o.semanticType === 'cluster:duration');
    expect(duration).toBeDefined();
    // Corpus baseline (~38) differs materially from either cluster median,
    // so at least one duration observation is emitted.
    expect(duration!.evidence.sampleSize).toBeGreaterThanOrEqual(3);
    expect(duration!.evidence.insufficient).toBe(false);
  });

  it('does not emit for clusters below minimum sample', () => {
    const tasks = [
      makeTask('Rare task', { actual_mins: 40 }),
      makeTask('Rare task', { actual_mins: 42 }),
      makeTask('Other thing', { actual_mins: 30 }),
    ];
    const obs = observeV2Clusters(tasks);
    const duration = obs.find((o) => o.semanticType === 'cluster:duration');
    expect(duration).toBeUndefined();
  });
});

describe('cluster - place observation', () => {
  it('emits a place association for a cluster dominant at one location', () => {
    const tasks = [
      makeTask('Errand run', { location_text: 'Store A' }),
      makeTask('Errand run', { location_text: 'Store A' }),
      makeTask('Errand run', { location_text: 'Store A' }),
      makeTask('Errand run', { location_text: 'Store A' }),
      makeTask('Errand run', { location_text: 'Elsewhere' }),
    ];
    const obs = observeV2Clusters(tasks);
    const place = obs.find((o) => o.semanticType === 'cluster:place');
    expect(place).toBeDefined();
    expect(place!.evidence.evidenceKind).toBe('association');
    expect(place!.affectedContext.location).toBe('store a');
  });
});

describe('cluster - insufficient handling', () => {
  it('does not emit an observation when the cluster lacks location data', () => {
    const tasks = [
      makeTask('Meeting', { location_text: null }),
      makeTask('Meeting', { location_text: null }),
      makeTask('Meeting', { location_text: null }),
      makeTask('Meeting', { location_text: null }),
      makeTask('Meeting', { location_text: null }),
    ];
    const obs = observeV2Clusters(tasks);
    const place = obs.find((o) => o.semanticType === 'cluster:place');
    expect(place).toBeUndefined();
  });
});
