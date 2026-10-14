import { describe, expect, it } from 'vitest';
import type { Meeting } from '@/lib/taskTypes';
import { deriveTodayCapacity } from '@/lib/today/dayCapacity';

function localTime(day: number, hour: number, minute = 0): Date {
  return new Date(2026, 8, day, hour, minute);
}

function event(id: string, start: Date, end: Date) {
  return {
    id,
    title: id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: false,
    location: null,
  };
}

describe('deriveTodayCapacity — Today working-slice contract', () => {
  it('merges overlapping calendar commitments without double-counting time', () => {
    const now = localTime(15, 9);
    const result = deriveTodayCapacity({
      tasks: [],
      meetings: [],
      calendarEvents: [
        event('site-meeting', localTime(15, 10), localTime(15, 11)),
        event('handover', localTime(15, 10, 30), localTime(15, 11, 30)),
      ],
      now,
      workDays: [now.getDay()],
      workStart: '08:00',
      workEnd: '16:00',
    });

    expect(result.isWorkDay).toBe(true);
    expect(result.dayCommitments).toHaveLength(2);
    expect(result.availability.blockedMinutes).toBe(90);
    expect(result.availability.availableMinutes).toBe(330);
    expect(result.taskCapacity).toBe(330);
  });

  it('subtracts untimed manual meetings once while excluding Outlook duplicate rows', () => {
    const now = localTime(15, 9);
    const untimedMeeting = (id: string, source: 'manual' | 'outlook') => ({
      id,
      text: id,
      start_time: null,
      duration_mins: 45,
      source,
    } as unknown as Meeting);

    const result = deriveTodayCapacity({
      tasks: [],
      meetings: [untimedMeeting('planning-call', 'manual'), untimedMeeting('outlook-copy', 'outlook')],
      calendarEvents: [],
      now,
      workDays: [now.getDay()],
      workStart: '08:00',
      workEnd: '16:00',
    });

    expect(result.todayMeetings).toHaveLength(2);
    expect(result.untimedManualMins).toBe(45);
    expect(result.availability.availableMinutes).toBe(420);
    expect(result.taskCapacity).toBe(375);
  });
});
