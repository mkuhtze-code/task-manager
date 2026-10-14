import { describe, expect, it } from 'vitest';
import { deriveTodayCapacity, type TodayCalendarEvent } from '@/lib/today/dayCapacity';

function eventAt(now: Date, startHour: number, endHour: number, id = `event-${startHour}-${endHour}`): TodayCalendarEvent {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, 0);
  return {
    id,
    title: 'Calendar commitment',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: false,
    location: null,
  };
}

function derive(now: Date, calendarEvents: TodayCalendarEvent[]) {
  return deriveTodayCapacity({
    tasks: [],
    meetings: [],
    calendarEvents,
    now,
    workDays: [now.getDay()],
    workStart: '08:00',
    workEnd: '17:00',
  });
}

describe('Today capacity integration', () => {
  it('shows the remaining workday as available when there are no commitments', () => {
    const now = new Date(2026, 9, 15, 9, 0);
    const result = derive(now, []);

    expect(result.isWorkDay).toBe(true);
    expect(result.minutesLeftToday).toBe(480);
    expect(result.availability.availableMinutes).toBe(480);
    expect(result.taskCapacity).toBe(480);
  });

  it('subtracts a calendar commitment from remaining capacity exactly once', () => {
    const now = new Date(2026, 9, 15, 9, 0);
    const result = derive(now, [eventAt(now, 10, 11)]);

    expect(result.minutesLeftToday).toBe(480);
    expect(result.availability.blockedMinutes).toBe(60);
    expect(result.availability.availableMinutes).toBe(420);
    expect(result.taskCapacity).toBe(420);
  });

  it('does not double-count overlapping calendar commitments', () => {
    const now = new Date(2026, 9, 15, 9, 0);
    const result = derive(now, [eventAt(now, 10, 11, 'event-a'), eventAt(now, 10, 12, 'event-b')]);

    expect(result.availability.blockedMinutes).toBe(120);
    expect(result.taskCapacity).toBe(360);
  });
});
