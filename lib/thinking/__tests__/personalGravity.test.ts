import { describe, it, expect } from 'vitest';
import {
  decidePersonalGravity,
  MIN_TOTAL_EVENTS,
  MIN_DAYS_OBSERVED,
  ACTIVE_WEIGHT,
  PASSIVE_WEIGHT,
  STRONG_MARGIN,
  SUGGEST_MARGIN,
  LOOKBACK_DAYS,
} from '../decisions/personalGravity';
import type { SurfaceEvent } from '../types';

// ── Helpers ──────────────────────────────────────────────────────
// Build surface events for testing. Each event gets a unique id and
// the specified surface, active flag, and timestamp.

function event(
  surface: SurfaceEvent['surface'],
  active: boolean,
  daysAgo: number,
  _now?: Date
): SurfaceEvent {
  const now = _now ?? new Date('2026-01-20T12:00:00Z');
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'user-test',
    surface,
    active,
    created_at: d.toISOString(),
  };
}

// Build N events on the same day
function eventsOnDay(
  surface: SurfaceEvent['surface'],
  active: boolean,
  count: number,
  daysAgo: number,
  _now?: Date
): SurfaceEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const now = _now ?? new Date('2026-01-20T12:00:00Z');
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(d.getHours() + i);
    return {
      id: `evt-${i}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: 'user-test',
      surface,
      active,
      created_at: d.toISOString(),
    };
  });
}

const NOW = new Date('2026-01-20T12:00:00Z');

// ── No evidence ──────────────────────────────────────────────────

describe('decidePersonalGravity', () => {
  describe('no evidence', () => {
    it('returns null preferredSurface for empty input', () => {
      const result = decidePersonalGravity([], NOW);
      expect(result.preferredSurface).toBeNull();
      expect(result.authority).toBe('observe');
      expect(result.evidence.totalEvents).toBe(0);
    });

    it('returns null when events are below MIN_TOTAL_EVENTS', () => {
      const events = Array.from({ length: MIN_TOTAL_EVENTS - 1 }, (_, i) =>
        event('jobs', true, i)
      );
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBeNull();
      expect(result.authority).toBe('observe');
    });

    it('returns null when events span fewer than MIN_DAYS_OBSERVED days', () => {
      // All events on same day — only 1 day observed
      const events = eventsOnDay('jobs', true, MIN_TOTAL_EVENTS + 5, 0, NOW);
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBeNull();
      expect(result.authority).toBe('observe');
    });

    it('returns null for only old events beyond lookback window', () => {
      const oldEvents = Array.from({ length: 20 }, (_, i) =>
        event('jobs', true, LOOKBACK_DAYS + 5 + i, NOW)
      );
      const result = decidePersonalGravity(oldEvents, NOW);
      expect(result.preferredSurface).toBeNull();
      expect(result.evidence.totalEvents).toBe(0);
    });
  });

  // ── Competing surfaces ─────────────────────────────────────────

  describe('competing surfaces', () => {
    it('returns null when evidence is equally distributed', () => {
      // Equal active events across all three surfaces
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', true, 5, 0, NOW),
        ...eventsOnDay('today', true, 5, 1, NOW),
        ...eventsOnDay('jobs', true, 5, 0, NOW),
        ...eventsOnDay('jobs', true, 5, 1, NOW),
        ...eventsOnDay('travel', true, 5, 0, NOW),
        ...eventsOnDay('travel', true, 5, 1, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBeNull();
      expect(result.authority).toBe('observe');
      expect(result.margin).toBeLessThan(SUGGEST_MARGIN);
    });

    it('returns null when margin is below SUGGEST_MARGIN', () => {
      // Jobs slightly ahead of Today, but not enough
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', true, 5, 0, NOW),
        ...eventsOnDay('today', true, 5, 1, NOW),
        ...eventsOnDay('today', true, 3, 2, NOW),
        ...eventsOnDay('jobs', true, 6, 0, NOW),
        ...eventsOnDay('jobs', true, 6, 1, NOW),
        ...eventsOnDay('jobs', true, 4, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // Margin should be small — close surfaces don't trigger adaptation
      expect(result.margin).toBeLessThan(SUGGEST_MARGIN);
      expect(result.preferredSurface).toBeNull();
    });

    it('returns "suggest" when margin is between SUGGEST and STRONG', () => {
      // Jobs ahead of Today, moderate margin
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', true, 5, 0, NOW),
        ...eventsOnDay('today', true, 5, 1, NOW),
        ...eventsOnDay('today', true, 5, 2, NOW),
        ...eventsOnDay('jobs', true, 8, 0, NOW),
        ...eventsOnDay('jobs', true, 8, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // today: 15×3=45, jobs: 24×3=72, total=39, maxPossible=117
      // margin = (72-45)/117 = 0.231 → SUGGEST
      expect(result.preferredSurface).toBe('jobs');
      expect(result.authority).toBe('suggest');
      expect(result.margin).toBeGreaterThanOrEqual(SUGGEST_MARGIN);
      expect(result.margin).toBeLessThan(STRONG_MARGIN);
    });

    it('returns "strong" when margin exceeds STRONG_MARGIN', () => {
      // Jobs dominates with active navigation
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 2, 0, NOW),
        ...eventsOnDay('today', false, 2, 1, NOW),
        ...eventsOnDay('jobs', true, 10, 0, NOW),
        ...eventsOnDay('jobs', true, 10, 1, NOW),
        ...eventsOnDay('jobs', true, 10, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBe('jobs');
      expect(result.authority).toBe('strong');
      expect(result.margin).toBeGreaterThanOrEqual(STRONG_MARGIN);
    });

    it('returns "strong" when Travel dominates with active navigation', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 1, 0, NOW),
        ...eventsOnDay('today', false, 1, 1, NOW),
        ...eventsOnDay('travel', true, 12, 0, NOW),
        ...eventsOnDay('travel', true, 12, 1, NOW),
        ...eventsOnDay('travel', true, 12, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBe('travel');
      expect(result.authority).toBe('strong');
    });
  });

  // ── Active vs passive weighting ─────────────────────────────────

  describe('active vs passive weighting', () => {
    it('passive Today exposure does not create a preference', () => {
      // User lands on Today repeatedly (passive) but actively navigates to Jobs.
      // Even with far more total Today events, active Jobs navigation wins
      // because active weight (3×) outweighs passive weight (1×).
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 10, 0, NOW),
        ...eventsOnDay('today', false, 10, 1, NOW),
        ...eventsOnDay('today', false, 10, 2, NOW),
        ...eventsOnDay('jobs', true, 8, 0, NOW),
        ...eventsOnDay('jobs', true, 8, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // today: 30×1=30, jobs: 24×3=72, total=54, maxPossible=162
      // Active navigation wins despite Today having more total events
      expect(result.preferredSurface).toBe('jobs');
    });

    it('active navigation carries substantially more weight than passive', () => {
      // Equal counts, but Jobs is active and Today is passive
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 8, 0, NOW),
        ...eventsOnDay('today', false, 8, 1, NOW),
        ...eventsOnDay('today', false, 8, 2, NOW),
        ...eventsOnDay('jobs', true, 8, 0, NOW),
        ...eventsOnDay('jobs', true, 8, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // today: 8×1=8 per day, jobs: 8×3=24 per day
      // Jobs should win decisively
      expect(result.preferredSurface).toBe('jobs');
      expect(result.authority).toBe('strong');
    });

    it('active Today does not outweigh active Jobs on equal counts', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', true, 8, 0, NOW),
        ...eventsOnDay('today', true, 8, 1, NOW),
        ...eventsOnDay('today', true, 8, 2, NOW),
        ...eventsOnDay('jobs', true, 8, 0, NOW),
        ...eventsOnDay('jobs', true, 8, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // Equal active counts — no meaningful difference
      expect(result.preferredSurface).toBeNull();
    });
  });

  // ── Repeated behaviour over time ───────────────────────────────

  describe('repeated behaviour over time', () => {
    it('consistent active Jobs navigation over 7 days produces strong preference', () => {
      const events: SurfaceEvent[] = [];
      for (let day = 0; day < 7; day++) {
        // User lands on Today passively once per day
        events.push(event('today', false, day, NOW));
        // User actively navigates to Jobs 3 times per day
        events.push(...eventsOnDay('jobs', true, 3, day, NOW));
      }
      const result = decidePersonalGravity(events, NOW);
      expect(result.preferredSurface).toBe('jobs');
      expect(result.authority).toBe('strong');
      expect(result.evidence.daysObserved).toBeGreaterThanOrEqual(7);
    });

    it('infrequent but consistent Travel preference over many days', () => {
      const events: SurfaceEvent[] = [];
      for (let day = 0; day < 10; day++) {
        events.push(event('today', false, day, NOW));
        events.push(event('travel', true, day, NOW));
      }
      const result = decidePersonalGravity(events, NOW);
      // travel: 10×3=30, today: 10×1=10 — strong preference
      expect(result.preferredSurface).toBe('travel');
      expect(result.authority).toBe('strong');
    });
  });

  // ── Stability / persistence ────────────────────────────────────

  describe('stability and persistence', () => {
    it('one anomalous session does not override consistent pattern', () => {
      const events: SurfaceEvent[] = [];
      // 14 days of consistent Jobs preference
      for (let day = 0; day < 14; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('jobs', true, 4, day, NOW));
      }
      // One day of Travel (anomaly)
      events.push(event('today', false, 0, NOW));
      events.push(...eventsOnDay('travel', true, 5, 0, NOW));

      const result = decidePersonalGravity(events, NOW);
      // Jobs still dominates: 14 days × 4 active + 14 passive vs 1 day × 5 active
      expect(result.preferredSurface).toBe('jobs');
    });

    it('eventual preference transition when behaviour shifts', () => {
      const events: SurfaceEvent[] = [];
      // First 30 days: Jobs preference
      for (let day = 30; day < 60; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('jobs', true, 3, day, NOW));
      }
      // Last 10 days: switched to Travel
      for (let day = 0; day < 10; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('travel', true, 4, day, NOW));
      }

      const result = decidePersonalGravity(events, NOW);
      // Both within lookback. Jobs: 30×3=90 active, 30×1=30 passive = 120
      // Travel: 10×3=30 active, 10×1=10 passive = 40
      // Today: 40×1=40 passive
      // Jobs still wins but with smaller margin
      expect(result.preferredSurface).toBe('jobs');
    });

    it('temporary change of behaviour does not override long-standing pattern', () => {
      const events: SurfaceEvent[] = [];
      // 20 days of consistent Jobs navigation
      for (let day = 5; day < 25; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('jobs', true, 5, day, NOW));
      }
      // 3 days of Travel (temporary)
      for (let day = 0; day < 3; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('travel', true, 3, day, NOW));
      }

      const result = decidePersonalGravity(events, NOW);
      // Jobs: 20×5=100 active, 20×1=20 passive = 120
      // Travel: 3×3=9 active, 3×1=3 passive = 12
      // Today: 23×1=23 passive
      expect(result.preferredSurface).toBe('jobs');
    });
  });

  // ── Override behaviour ──────────────────────────────────────────

  describe('override', () => {
    it('explicit navigation creates an active event that updates evidence', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 6, 0, NOW),
        ...eventsOnDay('today', false, 6, 1, NOW),
        ...eventsOnDay('today', false, 6, 2, NOW),
        ...eventsOnDay('today', false, 6, 3, NOW),
        ...eventsOnDay('jobs', true, 10, 0, NOW),
        ...eventsOnDay('jobs', true, 10, 1, NOW),
        ...eventsOnDay('jobs', true, 10, 2, NOW),
        // User explicitly navigated back to Today
        ...eventsOnDay('today', true, 5, 0, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // today: 5×3 + 24×1 = 39, jobs: 30×3 = 90
      // Jobs still wins, active Today events reduce the margin
      expect(result.preferredSurface).toBe('jobs');
    });

    it('engine never blocks explicit user behaviour', () => {
      // The engine only returns a decision — it cannot prevent navigation.
      // This test verifies the decision doesn't claim authority over
      // surfaces the user has explicitly interacted with.
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', true, 10, 0, NOW),
        ...eventsOnDay('today', true, 10, 1, NOW),
        ...eventsOnDay('jobs', true, 10, 0, NOW),
        ...eventsOnDay('jobs', true, 10, 1, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // Equal evidence — no decision
      expect(result.preferredSurface).toBeNull();
      expect(result.authority).toBe('observe');
    });
  });

  // ── Determinism ─────────────────────────────────────────────────

  describe('determinism', () => {
    it('identical input produces identical output', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 3, 0, NOW),
        ...eventsOnDay('today', false, 3, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 0, NOW),
        ...eventsOnDay('jobs', true, 8, 1, NOW),
        ...eventsOnDay('jobs', true, 8, 2, NOW),
      ];
      const r1 = decidePersonalGravity(events, NOW);
      const r2 = decidePersonalGravity(events, NOW);
      expect(r1.preferredSurface).toBe(r2.preferredSurface);
      expect(r1.authority).toBe(r2.authority);
      expect(r1.margin).toBe(r2.margin);
      expect(r1.evidence.totalEvents).toBe(r2.evidence.totalEvents);
    });
  });

  // ── Evidence shape ──────────────────────────────────────────────

  describe('evidence shape', () => {
    it('returns correct bySurface counts', () => {
      const events: SurfaceEvent[] = [
        event('today', true, 0, NOW),
        event('today', false, 0, NOW),
        event('jobs', true, 1, NOW),
        event('jobs', true, 1, NOW),
        event('travel', false, 2, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      expect(result.evidence.bySurface.today).toEqual({ active: 1, passive: 1 });
      expect(result.evidence.bySurface.jobs).toEqual({ active: 2, passive: 0 });
      expect(result.evidence.bySurface.travel).toEqual({ active: 0, passive: 1 });
      expect(result.evidence.totalEvents).toBe(5);
    });

    it('counts distinct days correctly', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('jobs', true, 3, 0, NOW),
        ...eventsOnDay('jobs', true, 2, 3, NOW),
        ...eventsOnDay('jobs', true, 1, 7, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      expect(result.evidence.daysObserved).toBe(3);
    });
  });

  // ── Lookback window ─────────────────────────────────────────────

  describe('lookback window', () => {
    it('only considers events within LOOKBACK_DAYS', () => {
      const recentEvents: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 3, 0, NOW),
        ...eventsOnDay('today', false, 3, 1, NOW),
        ...eventsOnDay('jobs', true, 6, 0, NOW),
        ...eventsOnDay('jobs', true, 6, 1, NOW),
        ...eventsOnDay('jobs', true, 6, 2, NOW),
      ];
      const oldEvents: SurfaceEvent[] = Array.from({ length: 50 }, (_, i) =>
        event('travel', true, LOOKBACK_DAYS + 10 + i, NOW)
      );
      const result = decidePersonalGravity([...recentEvents, ...oldEvents], NOW);
      // Old travel events should be excluded
      expect(result.evidence.bySurface.travel).toEqual({ active: 0, passive: 0 });
      expect(result.preferredSurface).toBe('jobs');
    });

    it('boundary events at exactly LOOKBACK_DAYS are included', () => {
      const events: SurfaceEvent[] = [
        ...eventsOnDay('today', false, 2, 0, NOW),
        ...eventsOnDay('today', false, 2, 1, NOW),
        ...eventsOnDay('jobs', true, 6, 0, NOW),
        ...eventsOnDay('jobs', true, 6, 1, NOW),
        ...eventsOnDay('jobs', true, 6, 2, NOW),
        // Exactly at the boundary
        ...eventsOnDay('jobs', true, 3, LOOKBACK_DAYS, NOW),
      ];
      const result = decidePersonalGravity(events, NOW);
      // Boundary events should be included
      expect(result.evidence.bySurface.jobs.active).toBeGreaterThanOrEqual(9);
    });
  });

  // ── Regression: existing behaviour intact ───────────────────────

  describe('regression', () => {
    it('does not affect the decision when input is empty', () => {
      const result = decidePersonalGravity([], NOW);
      expect(result.kind).toBe('personal_gravity');
      expect(result.preferredSurface).toBeNull();
    });

    it('handles large event sets without error', () => {
      const events: SurfaceEvent[] = [];
      for (let day = 0; day < 60; day++) {
        events.push(event('today', false, day, NOW));
        events.push(...eventsOnDay('jobs', true, 5, day, NOW));
        events.push(event('travel', true, day, NOW));
      }
      const result = decidePersonalGravity(events, NOW);
      expect(result.kind).toBe('personal_gravity');
      expect(result.preferredSurface).toBe('jobs');
    });
  });

  // ── Constants sanity ────────────────────────────────────────────

  describe('constants', () => {
    it('MIN_TOTAL_EVENTS is positive', () => {
      expect(MIN_TOTAL_EVENTS).toBeGreaterThan(0);
    });

    it('MIN_DAYS_OBSERVED is at least 2', () => {
      expect(MIN_DAYS_OBSERVED).toBeGreaterThanOrEqual(2);
    });

    it('ACTIVE_WEIGHT is greater than PASSIVE_WEIGHT', () => {
      expect(ACTIVE_WEIGHT).toBeGreaterThan(PASSIVE_WEIGHT);
    });

    it('STRONG_MARGIN is greater than SUGGEST_MARGIN', () => {
      expect(STRONG_MARGIN).toBeGreaterThan(SUGGEST_MARGIN);
    });

    it('SUGGEST_MARGIN is positive and less than 1', () => {
      expect(SUGGEST_MARGIN).toBeGreaterThan(0);
      expect(SUGGEST_MARGIN).toBeLessThan(1);
    });

    it('LOOKBACK_DAYS is reasonable (30-120)', () => {
      expect(LOOKBACK_DAYS).toBeGreaterThanOrEqual(30);
      expect(LOOKBACK_DAYS).toBeLessThanOrEqual(120);
    });
  });
});
