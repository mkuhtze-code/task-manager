import { describe, it, expect } from 'vitest';
import { decideLocationMemory } from '../decisions/locationMemory';
import type { CompletedTaskFacts } from '../types';
import type { ClusterPlaceAssociation } from '../associations/types';

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

function placeAssoc(overrides: Partial<ClusterPlaceAssociation> = {}): ClusterPlaceAssociation {
  return {
    kind: 'cluster_place',
    clusterLabel: 'site visit oakwood',
    locationText: 'Oakwood',
    occurrenceCount: 5,
    totalWithCoordinates: 6,
    totalInCluster: 8,
    ratio: 5 / 6,
    confidence: 'medium',
    ...overrides,
  };
}

function clusterTask(overrides: Partial<CompletedTaskFacts> = {}): CompletedTaskFacts {
  return task({
    text: 'Site visit',
    lat: 52.4128,
    lng: -1.7745,
    location_text: 'Oakwood',
    ...overrides,
  });
}

describe('decideLocationMemory', () => {
  describe('null-return conditions', () => {
    it('returns null when task already has location_text', () => {
      const t = task({ location_text: 'Already set' });
      const result = decideLocationMemory(t, [t], []);
      expect(result).toBeNull();
    });

    it('returns null when task already has coordinates', () => {
      const t = task({ lat: 52.41, lng: -1.77 });
      const result = decideLocationMemory(t, [t], []);
      expect(result).toBeNull();
    });

    it('returns null when there are no place associations', () => {
      const t = task();
      const result = decideLocationMemory(t, [t], []);
      expect(result).toBeNull();
    });

    it('returns null when all associations are below occurrence threshold', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 3, ratio: 0.8 });
      const result = decideLocationMemory(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when all associations are below ratio threshold', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.6 });
      const result = decideLocationMemory(t, [t], [a]);
      expect(result).toBeNull();
    });

    it('returns null when association meets thresholds but no matching task has coordinates', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const cluster = [clusterTask({ lat: null, lng: null })];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).toBeNull();
    });
  });

  describe('ambiguity', () => {
    it('returns null when two places both meet thresholds', () => {
      const t = task();
      const a1 = placeAssoc({
        locationText: 'Oakwood',
        occurrenceCount: 5,
        ratio: 0.8,
      });
      const a2 = placeAssoc({
        locationText: 'Birch',
        occurrenceCount: 4,
        ratio: 0.75,
      });
      const result = decideLocationMemory(t, [clusterTask()], [a1, a2]);
      expect(result).toBeNull();
    });
  });

  describe('successful decisions', () => {
    it('returns decision when single dominant place exists', () => {
      const t = task();
      const a = placeAssoc({
        locationText: 'Oakwood',
        occurrenceCount: 5,
        ratio: 0.8,
      });
      const cluster = [
        clusterTask({ location_text: 'Oakwood', lat: 52.4128, lng: -1.7745 }),
        clusterTask({ location_text: 'Oakwood', lat: 52.4129, lng: -1.7746 }),
      ];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe('location_memory');
      expect(result!.locationText).toBe('Oakwood');
      expect(result!.lat).toBe(52.4128);
      expect(result!.lng).toBe(-1.7745);
      expect(result!.occurrenceCount).toBe(5);
      expect(result!.ratio).toBe(0.8);
    });

    it('derives confidence from occurrence count', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 8, ratio: 0.9 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result!.confidence).toBe('high');
    });

    it('derives medium confidence from 4-6 occurrences', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result!.confidence).toBe('medium');
    });
  });

  describe('threshold boundaries', () => {
    it('accepts exactly at occurrence threshold (4)', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 4, ratio: 0.8 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).not.toBeNull();
    });

    it('rejects one below occurrence threshold (3)', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 3, ratio: 0.9 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).toBeNull();
    });

    it('accepts exactly at ratio threshold (0.7)', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 4, ratio: 0.7 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).not.toBeNull();
    });

    it('rejects one below ratio threshold (0.69)', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.69 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).toBeNull();
    });
  });

  describe('user override', () => {
    it('returns null when location_text is already set', () => {
      const t = task({ location_text: 'Different place' });
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const result = decideLocationMemory(t, [clusterTask()], [a]);
      expect(result).toBeNull();
    });

    it('returns null when lat/lng already set', () => {
      const t = task({ lat: 52.41, lng: -1.77 });
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const result = decideLocationMemory(t, [clusterTask()], [a]);
      expect(result).toBeNull();
    });
  });

  describe('determinism', () => {
    it('same input always yields same output', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const cluster = [clusterTask()];
      const r1 = decideLocationMemory(t, cluster, [a]);
      const r2 = decideLocationMemory(t, cluster, [a]);
      expect(r1).toEqual(r2);
    });
  });

  describe('no mutation', () => {
    it('does not modify input facts or associations', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 5, ratio: 0.8 });
      const cluster = [clusterTask()];
      const tBefore = JSON.parse(JSON.stringify(t));
      const aBefore = JSON.parse(JSON.stringify(a));
      const cBefore = JSON.parse(JSON.stringify(cluster));

      decideLocationMemory(t, cluster, [a]);

      expect(t).toEqual(tBefore);
      expect(a).toEqual(aBefore);
      expect(cluster).toEqual(cBefore);
    });
  });

  describe('cold-start / authority', () => {
    it('does not produce strong authority from low evidence', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 4, ratio: 0.7 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).not.toBeNull();
      expect(result!.authority).not.toBe('strong');
    });

    it('produces strong authority from high evidence', () => {
      const t = task();
      const a = placeAssoc({ occurrenceCount: 8, ratio: 0.9 });
      const cluster = [clusterTask()];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result!.authority).toBe('strong');
    });
  });

  describe('coordinate resolution', () => {
    it('uses coordinates from the first matching cluster task', () => {
      const t = task();
      const a = placeAssoc({ locationText: 'Oakwood', occurrenceCount: 5, ratio: 0.8 });
      const cluster = [
        clusterTask({ location_text: 'Oakwood', lat: 52.4128, lng: -1.7745 }),
        clusterTask({ location_text: 'Oakwood', lat: 52.4130, lng: -1.7750 }),
      ];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result!.lat).toBe(52.4128);
      expect(result!.lng).toBe(-1.7745);
    });

    it('skips cluster tasks without valid coordinates', () => {
      const t = task();
      const a = placeAssoc({ locationText: 'Oakwood', occurrenceCount: 5, ratio: 0.8 });
      const cluster = [
        clusterTask({ location_text: 'Oakwood', lat: null, lng: null }),
        clusterTask({ location_text: 'Oakwood', lat: 52.4128, lng: -1.7745 }),
      ];
      const result = decideLocationMemory(t, cluster, [a]);
      expect(result).not.toBeNull();
      expect(result!.lat).toBe(52.4128);
      expect(result!.lng).toBe(-1.7745);
    });
  });
});
