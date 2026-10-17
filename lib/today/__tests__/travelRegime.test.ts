import { describe, expect, it } from 'vitest';
import { computeTravelPresenceImpact } from '@/lib/travelPresence';
import {
  composeTravelCapacity,
  resolveTodayTravelWindow,
  todayTravelRegimeLabel,
} from '@/lib/today/travelRegime';

describe('Today travel regime', () => {
  it('preserves travelPresence leisure-vs-work rules', () => {
    const leisure = computeTravelPresenceImpact([
      { id: 'beach', stop_kind: 'leisure', presence: 'all_day' },
    ], 420, 480);
    const work = computeTravelPresenceImpact([
      { id: 'site', stop_kind: 'work', presence: 'all_day' },
    ], 420, 480);
    expect(leisure.blockedMins).toBe(0);
    expect(composeTravelCapacity(420, leisure.blockedMins)).toEqual({
      taskCapacity: 420,
      incrementalBlockedMins: 0,
    });
    expect(work.blockedMins).toBe(420);
  });

  it('keeps legacy untyped all-day presence blocking', () => {
    const legacy = computeTravelPresenceImpact([{ id: 'legacy', presence: 'all_day' }], 420, 480);
    expect(legacy.blockedMins).toBe(420);
  });

  it('allocates work presence only from capacity left after meetings/calendar', () => {
    expect(composeTravelCapacity(60, 180)).toEqual({ taskCapacity: 0, incrementalBlockedMins: 60 });
  });

  it('does not double-count travel beyond uncommitted capacity', () => {
    expect(composeTravelCapacity(300, 90)).toEqual({ taskCapacity: 210, incrementalBlockedMins: 90 });
  });

  it('shortens a work-intent flight day to the home-hours intersection after landing', () => {
    const window = resolveTodayTravelWindow({
      tripIntent: 'work',
      day: { day_start: '08:00', day_end: '17:00', arrival_time: '13:00', departure_time: '16:00' },
      flightScheduled: true,
      workStart: '08:00',
      workEnd: '16:00',
    });
    expect(window.startClock).toBe('13:45');
    expect(window.endClock).toBe('16:00');
    expect(window.endMins - window.startMins).toBe(135);
    expect(window.flightShaped).toBe(true);
  });

  it('does not let a stale flight anchor change a non-flight or personal day', () => {
    for (const args of [
      { tripIntent: 'work' as const, flightScheduled: false },
      { tripIntent: 'personal' as const, flightScheduled: true },
    ]) {
      const window = resolveTodayTravelWindow({
        ...args,
        day: { day_start: '08:00', day_end: '17:00', arrival_time: '13:00', departure_time: '16:00' },
        workStart: '08:00',
        workEnd: '16:00',
      });
      expect(window.startClock).toBe('08:00');
      expect(window.endClock).toBe('16:00');
      expect(window.flightShaped).toBe(false);
    }
  });

  it('shows and hides the regime line from active trip context', () => {
    expect(todayTravelRegimeLabel({ tripName: null, tripIntent: 'work', impactMode: 'none' })).toBeNull();
    expect(todayTravelRegimeLabel({ tripName: 'Site run', tripIntent: 'work', impactMode: 'all_day' })).toBe('On site today');
    expect(todayTravelRegimeLabel({ tripName: 'Personal trip', tripIntent: 'personal', impactMode: 'none' })).toBe('Away today');
  });
});
