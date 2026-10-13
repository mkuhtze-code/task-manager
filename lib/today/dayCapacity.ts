import type { Meeting, Task } from '@/lib/taskTypes';
import {
  buildDayCommitments,
  computeAvailability,
} from '@/lib/calendar/planning';
import { isScheduledForLater, localDateStr, timeStringToMinutes } from '@/lib/timeFormat';

export type TodayCalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
};

type DeriveTodayCapacityInput = {
  tasks: Task[];
  meetings: Meeting[];
  calendarEvents: TodayCalendarEvent[];
  now: Date;
  workDays: number[];
  workStart: string;
  workEnd: string;
};

export function deriveTodayCapacity({
  tasks,
  meetings,
  calendarEvents,
  now,
  workDays,
  workStart,
  workEnd,
}: DeriveTodayCapacityInput) {
  const todayStr = localDateStr(now);

  // Future reminders stay outside today's capacity, sorting, and day rail.
  const visibleTasks = tasks.filter((task) => !isScheduledForLater(task, todayStr));
  const scheduledTasks = tasks.filter((task) => isScheduledForLater(task, todayStr));

  const todayMeetings = meetings.filter((meeting) => {
    if (!meeting.start_time) return true;
    return localDateStr(new Date(meeting.start_time)) === todayStr;
  });
  const todayDow = now.getDay();
  const isWorkDay = workDays.includes(todayDow);

  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const workStartMinutes = timeStringToMinutes(workStart);
  const workEndMinutes = timeStringToMinutes(workEnd);
  const minutesLeftToday = isWorkDay
    ? Math.max(workEndMinutes - nowMinutesOfDay, 0)
    : 0;

  // Timed meetings and calendar events share interval-aware capacity logic.
  const dayCommitments = buildDayCommitments({
    calendarEvents,
    meetings: todayMeetings,
  });
  const availability = computeAvailability({
    now,
    workStartMins: workStartMinutes,
    workEndMins: workEndMinutes,
    isWorkDay,
    commitments: dayCommitments,
  });

  // Untimed manual meetings have no interval and remain flat subtractors.
  const untimedManualMins = todayMeetings
    .filter((meeting) => meeting.source !== 'outlook' && !meeting.start_time)
    .reduce((sum, meeting) => sum + meeting.duration_mins, 0);
  const taskCapacity = availability.availableMinutes - untimedManualMins;

  return {
    todayStr,
    visibleTasks,
    scheduledTasks,
    todayMeetings,
    todayDow,
    isWorkDay,
    nowMinutesOfDay,
    workStartMinutes,
    workEndMinutes,
    minutesLeftToday,
    dayCommitments,
    availability,
    untimedManualMins,
    taskCapacity,
  };
}
