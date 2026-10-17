import type { Meeting, Task } from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
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
  /** Flight-shaped trip windows must not count time before arrival as usable. */
  clampToWorkStart?: boolean;
};

export function deriveTodayCapacity({
  tasks,
  meetings,
  calendarEvents,
  now,
  workDays,
  workStart,
  workEnd,
  clampToWorkStart = false,
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
  const capacityClockMins = clampToWorkStart
    ? Math.max(nowMinutesOfDay, workStartMinutes)
    : nowMinutesOfDay;
  const minutesLeftToday = isWorkDay
    ? Math.max(workEndMinutes - capacityClockMins, 0)
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


type DeriveActiveCommitmentsInput = {
  calendarEvents: TodayCalendarEvent[];
  todayMeetings: Meeting[];
  jobs: Job[];
  now: Date;
};

/** Build the shared time-ordered calendar/meeting rows shown on Today. */
export function deriveActiveCommitments({
  calendarEvents,
  todayMeetings,
  jobs,
  now,
}: DeriveActiveCommitmentsInput) {
  return [
    ...calendarEvents
      .filter((event) => new Date(event.end_at).getTime() > now.getTime())
      .map((event) => ({
        ...event,
        kind: 'calendar' as const,
      })),
    ...todayMeetings
      .filter((meeting) => meeting.source !== 'outlook' && Boolean(meeting.start_time))
      .map((meeting) => {
        const start = new Date(meeting.start_time!);
        const end = new Date(start.getTime() + meeting.duration_mins * 60000);
        return {
          id: `meeting-${meeting.id}`,
          title: meeting.text || 'Meeting',
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          all_day: false,
          href: `/meetings/${meeting.id}`,
          kind: 'meeting' as const,
          jobLabel: meeting.job_id
            ? jobs.find((job) => job.id === meeting.job_id)?.name ?? null
            : null,
        };
      }),
  ].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}
