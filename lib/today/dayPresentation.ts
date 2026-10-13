import {
  suggestEstimate,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';
import { fmtMins } from '@/lib/timeFormat';
import { estimateContextFrom } from '@/lib/today/useTodayIntelligence';

type TodayCommitmentLike = {
  all_day: boolean;
  start_at: string;
  end_at: string;
  title: string;
};

type DeriveTodayDayPresentationInput = {
  ordered: Task[];
  history: HistoricalTask[];
  clusters: ReturnType<typeof import('@/lib/taskIntelligence').buildClusters>;
  now: Date;
  isWorkDay: boolean;
  overloaded: boolean;
  remainingTaskMins: number;
  openVisible: Task[];
  usableMins: number;
  remainingWorkMins: number;
  fixedMins: number;
  minutesLeftToday: number;
  routeDriveMins: number;
  activeCommitments: TodayCommitmentLike[];
  taskCapacity: number;
  workStartMinutes: number;
  workEndMinutes: number;
  isDesktop: boolean;
};

/** Pure, presentation-facing summary for the Today header and day-depth rail. */
export function deriveTodayDayPresentation({
  ordered,
  history,
  clusters,
  now,
  isWorkDay,
  overloaded,
  remainingTaskMins,
  openVisible,
  usableMins,
  remainingWorkMins,
  fixedMins,
  minutesLeftToday,
  routeDriveMins,
  activeCommitments,
  taskCapacity,
  workStartMinutes,
  workEndMinutes,
  isDesktop,
}: DeriveTodayDayPresentationInput) {
  const fitsNow = ordered
    .filter((task) => task.status !== 'done')
    .slice(0, 3)
    .map((task) => task.text.trim())
    .filter(Boolean);

  const dayRead = !isWorkDay
    ? 'Outside your usual working days.'
    : overloaded
      ? 'Remaining work no longer fits today.'
      : remainingTaskMins <= 0 && openVisible.length === 0
        ? "You're clear for the rest of today."
        : remainingTaskMins <= 0
          ? 'No timed work left — list items can still be cleared.'
          : usableMins > remainingWorkMins + 30
            ? 'You have room for another task.'
            : remainingWorkMins > usableMins
              ? 'Your afternoon is getting tighter.'
              : 'Your day is on track.';

  const workSpan = Math.max(workEndMinutes - workStartMinutes, 1);
  const commitmentMarkers = activeCommitments
    .filter((commitment) => !commitment.all_day)
    .map((commitment) => {
      const start = new Date(commitment.start_at);
      const end = new Date(commitment.end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const clampedStart = Math.max(startMinutes, workStartMinutes);
      const clampedEnd = Math.min(endMinutes, workEndMinutes);
      if (clampedEnd <= clampedStart) return null;
      return {
        startPct: (clampedStart - workStartMinutes) / workSpan,
        endPct: (clampedEnd - workStartMinutes) / workSpan,
        label: commitment.title || 'Fixed',
      };
    })
    .filter((item): item is { startPct: number; endPct: number; label: string } => item != null)
    .slice(0, 8);

  // Lead with a repeated pattern attached to today's actual plan.
  const patternInsight = ordered
    .map((task) => {
      if (task.status === 'done' || !task.estimate_mins || task.estimate_mins <= 0) return null;
      const learned = suggestEstimate(task.text, history, clusters, estimateContextFrom(task, now));
      if (!learned || learned.source === 'lifecycle' || learned.sampleCount < 2) return null;
      const deltaMins = learned.suggestedMins - task.estimate_mins;
      const relativeDelta = Math.abs(deltaMins) / Math.max(task.estimate_mins, learned.suggestedMins, 1);
      return {
        taskText: task.text,
        patternLabel: learned.matchedLabel,
        sampleCount: learned.sampleCount,
        plannedMins: task.estimate_mins,
        learnedMins: learned.suggestedMins,
        deltaMins,
        relativeDelta,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => (b.relativeDelta * Math.log2(b.sampleCount + 1)) - (a.relativeDelta * Math.log2(a.sampleCount + 1)))[0] ?? null;

  const dayDepth = isDesktop
    ? {
        clockRemainingMins: minutesLeftToday,
        usableMins,
        fixedMins,
        plannedTaskMins: remainingTaskMins,
        travelMins: routeDriveMins,
        fitsNow,
        dayRead,
        commitmentMarkers,
      }
    : null;

  return { fitsNow, dayRead, commitmentMarkers, patternInsight, dayDepth };
}
