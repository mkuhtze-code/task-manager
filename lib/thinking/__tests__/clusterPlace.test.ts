import { describe, it, expect } from 'vitest';
import type { CompletedTaskFacts } from '../types';
import { findClusterPlaceAssociations } from '../associations/clusterPlace';

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
const HENDERSON = { lat: 52.4521, lng: -1.7434 };
const SUPPLIER = { lat: 52.4734, lng: -1.9108 };

describe('findClusterPlaceAssociations', () => {
  describe('basic association detection', () => {
    it('3/3 same place → association', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(3);
      expect(assocs[0].totalWithCoordinates).toBe(3);
      expect(assocs[0].ratio).toBe(1);
      expect(assocs[0].locationText).toBe('Home');
    });

    it('2/2 same place → no association (insufficient sample)', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });

    it('2/3 same place → association', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].locationText).toBe('Home');
      expect(assocs[0].occurrenceCount).toBe(2);
      expect(assocs[0].ratio).toBeCloseTo(2 / 3);
    });

    it('1/3 same place → no association (ratio below threshold)', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
        makeTask({ text: 'C', lat: SUPPLIER.lat, lng: SUPPLIER.lng, location_text: 'Supplier' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });

    it('3/3 at one place and 3/3 at another → two associations', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'D', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
        makeTask({ text: 'E', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
        makeTask({ text: 'F', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(2);
    });
  });

  describe('GPS drift and proximity', () => {
    it('GPS drift within 50m counts as same place', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat + 0.0003, lng: HOME.lng, location_text: 'Home workshop' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng + 0.0003, location_text: 'Home' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(3);
    });

    it('just outside 50m counts as different place', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        // ~100m away
        makeTask({ text: 'D', lat: HOME.lat + 0.0009, lng: HOME.lng, location_text: 'Home (other)' }),
        makeTask({ text: 'E', lat: HOME.lat + 0.0009, lng: HOME.lng, location_text: 'Home (other)' }),
        makeTask({ text: 'F', lat: HOME.lat + 0.0009, lng: HOME.lng, location_text: 'Home (other)' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(2);
    });
  });

  describe('text vs coordinates', () => {
    it('different text, same coordinates → same place', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Workshop' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(3);
      // Most frequent text wins
      expect(assocs[0].locationText).toBe('Home');
    });

    it('same text, different coordinates → different places', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Merchants' }),
        makeTask({ text: 'B', lat: SUPPLIER.lat, lng: SUPPLIER.lng, location_text: 'Merchants' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Merchants' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      // Two distinct coordinate groups, each with 2 and 1 tasks
      // Only the group of 2 meets the minimum
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(2);
    });
  });

  describe('missing coordinates', () => {
    it('tasks without coordinates are excluded from spatial analysis', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'D', lat: null, lng: null, location_text: null }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(3);
      expect(assocs[0].totalWithCoordinates).toBe(3);
      expect(assocs[0].totalInCluster).toBe(4);
    });

    it('all tasks without coordinates → no associations', () => {
      const tasks = [
        makeTask({ text: 'A', lat: null, lng: null }),
        makeTask({ text: 'B', lat: null, lng: null }),
        makeTask({ text: 'C', lat: null, lng: null }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(0);
    });

    it('NaN coordinates treated as missing', () => {
      const tasks = [
        makeTask({ text: 'A', lat: NaN, lng: -1.89, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'D', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(3);
      expect(assocs[0].totalWithCoordinates).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('empty array → no associations', () => {
      expect(findClusterPlaceAssociations('test', [])).toHaveLength(0);
    });

    it('single task → no associations', () => {
      const tasks = [makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng })];
      expect(findClusterPlaceAssociations('test', tasks)).toHaveLength(0);
    });

    it('exactly 3 tasks at threshold boundary', () => {
      const tasks = [
        makeTask({ text: 'A', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'B', lat: HOME.lat, lng: HOME.lng, location_text: 'Home' }),
        makeTask({ text: 'C', lat: HENDERSON.lat, lng: HENDERSON.lng, location_text: 'Henderson' }),
      ];
      const assocs = findClusterPlaceAssociations('test', tasks);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].occurrenceCount).toBe(2);
      expect(assocs[0].ratio).toBeCloseTo(2 / 3);
    });
  });
});
