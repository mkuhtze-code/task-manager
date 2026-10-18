import { describe, expect, it } from 'vitest';
import { planTripDateRangeChange } from '@/lib/travel/planMutations';

describe('planTripDateRangeChange', () => {
  const days = [
    { id: 'd1', date: '2026-10-10' },
    { id: 'd2', date: '2026-10-11' },
    { id: 'd3', date: '2026-10-12' },
  ];

  it('extends by adding only missing dates', () => {
    const plan = planTripDateRangeChange({
      currentStartDate: '2026-10-10', currentEndDate: '2026-10-12',
      nextStartDate: '2026-10-10', nextEndDate: '2026-10-14',
      days, activities: [],
    });
    expect(plan.valid).toBe(true);
    expect(plan.addedDates).toEqual(['2026-10-13', '2026-10-14']);
    expect(plan.removedDays).toEqual([]);
  });

  it('detects activities orphaned by a shrink and preserves them via nearest retained day', () => {
    const plan = planTripDateRangeChange({
      currentStartDate: '2026-10-10', currentEndDate: '2026-10-12',
      nextStartDate: '2026-10-11', nextEndDate: '2026-10-11',
      days, activities: [{ id: 'a1', trip_day_id: 'd1' }, { id: 'a2', trip_day_id: 'd3' }],
    });
    expect(plan.valid).toBe(true);
    expect(plan.orphanedActivities.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(plan.activityMoves).toEqual([
      { activityId: 'a1', fromDayId: 'd1', toDate: '2026-10-11' },
      { activityId: 'a2', fromDayId: 'd3', toDate: '2026-10-11' },
    ]);
  });

  it('rejects reversed, invalid, and excessive ranges', () => {
    const base = { currentStartDate: '2026-10-10', currentEndDate: '2026-10-12', days, activities: [] };
    expect(planTripDateRangeChange({ ...base, nextStartDate: '2026-10-12', nextEndDate: '2026-10-10' }).valid).toBe(false);
    expect(planTripDateRangeChange({ ...base, nextStartDate: 'bad', nextEndDate: '2026-10-10' }).valid).toBe(false);
    expect(planTripDateRangeChange({ ...base, nextStartDate: '2026-01-01', nextEndDate: '2027-12-31' }).valid).toBe(false);
  });
});
