import { describe, expect, it } from 'vitest';
import { deriveTodayCapacity, type TodayCalendarEvent } from '@/lib/today/dayCapacity';

const now = new Date(2026, 9, 15, 8, 0, 0);

function event(startHour: number, endHour: number, dayOffset = 0): TodayCalendarEvent {
  const start = new Date(now);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(endHour, 0, 0, 0);
  return {
    id: `event-${dayOffset}-${startHour}-${endHour}`,
    title: 'Calendar commitment',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: false,
    location: null,
  };
}

function capacity(calendarEvents: TodayCalendarEvent[]) {
  return deriveTodayCapacity({
    tasks: [],
    meetings: [],
    calendarEvents,
    now,
    workDays: [now.getDay()],
    workStart: '08:00',
    workEnd: '16:00',
  });
}

describe('deriveTodayCapacity — mobile working-slice regression', () => {
  it('reduces available task capacity when a selected calendar event is present', () => {
    const withoutCalendarCommitments = capacity([]);
    const withSelectedCalendarEvent = capacity([event(10, 12)]);

    expect(withoutCalendarCommitments.availability.availableMinutes).toBe(480);
    expect(withSelectedCalendarEvent.availability.blockedMinutes).toBe(120);
    expect(withSelectedCalendarEvent.availability.availableMinutes).toBe(360);
    expect(withSelectedCalendarEvent.taskCapacity).toBe(360);
  });

  it('does not let a next-day event consume today capacity', () => {
    const result = capacity([event(10, 12, 1)]);

    expect(result.availability.blockedMinutes).toBe(0);
    expect(result.availability.availableMinutes).toBe(480);
  });

  it('does not double-count overlapping selected calendar events', () => {
    const result = capacity([event(10, 12), event(11, 13)]);

    expect(result.availability.blockedMinutes).toBe(180);
    expect(result.availability.availableMinutes).toBe(300);
  });
});
