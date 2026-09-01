import { describe, it, expect } from 'vitest';
import { sortActivities, findFixedTimeConflicts, type SortableActivity } from '../travelSort';

function createMockActivity(overrides: Partial<SortableActivity> = {}): SortableActivity {
  return {
    id: 'act-' + Math.random().toString(36).substring(2, 9),
    text: 'Test activity',
    time_type: 'flexible',
    fixed_time: null,
    estimate_mins: 30,
    drive_mins_to_next: 15,
    order_index: 0,
    lat: 52.4,
    lng: -1.7,
    ...overrides,
  };
}

describe('travelSort - sortActivities', () => {
  it('handles empty activity lists', () => {
    expect(sortActivities([], 'manual', null)).toEqual([]);
    expect(sortActivities([], 'what_fits', null)).toEqual([]);
    expect(sortActivities([], 'close_to_accom', { lat: 52.4, lng: -1.7 })).toEqual([]);
  });

  it('preserves fixed item positions while weaving sorted flexible items into flexible slots', () => {
    // Original indices: 0 (flex), 1 (fixed @ 14:00), 2 (flex), 3 (fixed @ 10:00)
    const flex1 = createMockActivity({ id: 'flex1', time_type: 'flexible', estimate_mins: 60, drive_mins_to_next: 10, order_index: 0 });
    const fixed1 = createMockActivity({ id: 'fixed1', time_type: 'fixed', fixed_time: '14:00', order_index: 1 });
    const flex2 = createMockActivity({ id: 'flex2', time_type: 'flexible', estimate_mins: 20, drive_mins_to_next: 5, order_index: 2 });
    const fixed2 = createMockActivity({ id: 'fixed2', time_type: 'fixed', fixed_time: '10:00', order_index: 3 });

    // Mode 'what_fits': flexible items sorted by (estimate + drive):
    // flex2 (20+5 = 25) comes before flex1 (60+10 = 70).
    // Fixed items sorted chronologically: fixed2 (10:00) comes before fixed1 (14:00).
    // Original slot pattern by order_index: [flex, fixed, flex, fixed].
    // Weaved result: [flex2, fixed2, flex1, fixed1].
    const sorted = sortActivities([flex1, fixed1, flex2, fixed2], 'what_fits', null);
    expect(sorted.map((a) => a.id)).toEqual(['flex2', 'fixed2', 'flex1', 'fixed1']);
  });

  describe('what_fits mode', () => {
    it('sorts flexible activities by estimate_mins + drive_mins_to_next ascending', () => {
      const a1 = createMockActivity({ id: 'long', estimate_mins: 60, drive_mins_to_next: 30, order_index: 0 }); // 90
      const a2 = createMockActivity({ id: 'short', estimate_mins: 15, drive_mins_to_next: 5, order_index: 1 });  // 20
      const a3 = createMockActivity({ id: 'mid', estimate_mins: 30, drive_mins_to_next: 15, order_index: 2 });   // 45

      const sorted = sortActivities([a1, a2, a3], 'what_fits', null);
      expect(sorted.map((a) => a.id)).toEqual(['short', 'mid', 'long']);
    });

    it('handles zero or minimal travel time (drive_mins_to_next = 0)', () => {
      const a1 = createMockActivity({ id: 'a1', estimate_mins: 30, drive_mins_to_next: 0, order_index: 0 }); // 30
      const a2 = createMockActivity({ id: 'a2', estimate_mins: 20, drive_mins_to_next: 5, order_index: 1 }); // 25

      const sorted = sortActivities([a1, a2], 'what_fits', null);
      expect(sorted.map((a) => a.id)).toEqual(['a2', 'a1']);
    });
  });

  describe('close_to_accom and nearby_me modes', () => {
    const accomRef = { lat: 52.4000, lng: -1.7000 };

    it('sorts flexible activities by Haversine distance to reference point', () => {
      // Close point: 52.4010, -1.7010
      const close = createMockActivity({ id: 'close', lat: 52.4010, lng: -1.7010, order_index: 0 });
      // Far point: 52.5000, -1.8000
      const far = createMockActivity({ id: 'far', lat: 52.5000, lng: -1.8000, order_index: 1 });

      const sortedAccom = sortActivities([far, close], 'close_to_accom', accomRef);
      expect(sortedAccom.map((a) => a.id)).toEqual(['close', 'far']);

      const sortedNearby = sortActivities([far, close], 'nearby_me', accomRef);
      expect(sortedNearby.map((a) => a.id)).toEqual(['close', 'far']);
    });

    it('pushes activities without lat/lng to the end of flexible items', () => {
      const located = createMockActivity({ id: 'located', lat: 52.4010, lng: -1.7010, order_index: 0 });
      const unlocated = createMockActivity({ id: 'unlocated', lat: null, lng: null, order_index: 1 });

      const sorted = sortActivities([unlocated, located], 'close_to_accom', accomRef);
      expect(sorted.map((a) => a.id)).toEqual(['located', 'unlocated']);
    });

    it('falls back to order_index sorting if referencePoint is null', () => {
      const a1 = createMockActivity({ id: 'a1', order_index: 1 });
      const a2 = createMockActivity({ id: 'a2', order_index: 0 });

      const sorted = sortActivities([a1, a2], 'close_to_accom', null);
      expect(sorted.map((a) => a.id)).toEqual(['a2', 'a1']);
    });
  });

  describe('manual mode', () => {
    it('sorts flexible activities by order_index', () => {
      const a1 = createMockActivity({ id: 'a1', order_index: 2 });
      const a2 = createMockActivity({ id: 'a2', order_index: 0 });
      const a3 = createMockActivity({ id: 'a3', order_index: 1 });

      const sorted = sortActivities([a1, a2, a3], 'manual', null);
      expect(sorted.map((a) => a.id)).toEqual(['a2', 'a3', 'a1']);
    });
  });
});

describe('travelSort - findFixedTimeConflicts', () => {
  it('returns empty object when there are no fixed time conflicts', () => {
    // Day starts at 08:00 (480 mins).
    // Flex: 30m + 15m drive -> running = 525 (08:45).
    // Fixed: 09:00 (540 mins) -> 525 <= 540 -> No conflict!
    const flex = createMockActivity({ id: 'flex', time_type: 'flexible', estimate_mins: 30, drive_mins_to_next: 15 });
    const fixed = createMockActivity({ id: 'fixed', time_type: 'fixed', fixed_time: '09:00', estimate_mins: 40, drive_mins_to_next: 10 });

    const conflicts = findFixedTimeConflicts([flex, fixed], 480);
    expect(conflicts).toEqual({});
  });

  it('detects conflict when running total exceeds fixed time slot', () => {
    // Day starts at 08:00 (480 mins).
    // Flex: 60m + 30m drive -> running = 570 (09:30).
    // Fixed: 09:00 (540 mins) -> 570 > 540 -> Conflict!
    const flex = createMockActivity({ id: 'flex', time_type: 'flexible', estimate_mins: 60, drive_mins_to_next: 30 });
    const fixed = createMockActivity({ id: 'fixed', time_type: 'fixed', fixed_time: '09:00', estimate_mins: 30, drive_mins_to_next: 0 });

    const conflicts = findFixedTimeConflicts([flex, fixed], 480);
    expect(conflicts).toEqual({ fixed: true });
  });

  it('handles boundary condition where running minutes exactly equals fixed time (no conflict)', () => {
    // Day starts at 08:00 (480 mins).
    // Flex: 45m + 15m drive -> running = 540 (09:00).
    // Fixed: 09:00 (540 mins) -> 540 <= 540 -> No conflict!
    const flex = createMockActivity({ id: 'flex', time_type: 'flexible', estimate_mins: 45, drive_mins_to_next: 15 });
    const fixed = createMockActivity({ id: 'fixed', time_type: 'fixed', fixed_time: '09:00', estimate_mins: 30, drive_mins_to_next: 0 });

    const conflicts = findFixedTimeConflicts([flex, fixed], 480);
    expect(conflicts).toEqual({});
  });

  it('resets running total after a fixed item and evaluates subsequent fixed items correctly', () => {
    // Day starts at 08:00 (480 mins).
    // Flex 1: 60m + 30m drive -> running = 570 (09:30).
    // Fixed 1 @ 09:00 (540) -> CONFLICT! Next running = 540 + 30 + 10 = 580 (09:40).
    // Fixed 2 @ 10:00 (600) -> 580 <= 600 -> NO conflict! Next running = 600 + 30 + 0 = 630.
    const flex1 = createMockActivity({ id: 'flex1', time_type: 'flexible', estimate_mins: 60, drive_mins_to_next: 30 });
    const fixed1 = createMockActivity({ id: 'fixed1', time_type: 'fixed', fixed_time: '09:00', estimate_mins: 30, drive_mins_to_next: 10 });
    const fixed2 = createMockActivity({ id: 'fixed2', time_type: 'fixed', fixed_time: '10:00', estimate_mins: 30, drive_mins_to_next: 0 });

    const conflicts = findFixedTimeConflicts([flex1, fixed1, fixed2], 480);
    expect(conflicts).toEqual({ fixed1: true });
  });

  it('handles multiple travel legs accumulating drive times', () => {
    // Day starts at 09:00 (540 mins).
    // Leg 1: 20m + 15m drive -> running = 575
    // Leg 2: 20m + 15m drive -> running = 610 (10:10)
    // Fixed @ 10:00 (600) -> 610 > 600 -> Conflict!
    const leg1 = createMockActivity({ id: 'leg1', time_type: 'flexible', estimate_mins: 20, drive_mins_to_next: 15 });
    const leg2 = createMockActivity({ id: 'leg2', time_type: 'flexible', estimate_mins: 20, drive_mins_to_next: 15 });
    const fixed = createMockActivity({ id: 'fixed', time_type: 'fixed', fixed_time: '10:00', estimate_mins: 30, drive_mins_to_next: 0 });

    const conflicts = findFixedTimeConflicts([leg1, leg2, fixed], 540);
    expect(conflicts).toEqual({ fixed: true });
  });
});
