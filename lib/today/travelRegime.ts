import { resolveScheduledDayAnchor } from '@/lib/travel/travelContext';

export type TodayTravelDay = {
  day_start?: string | null;
  day_end?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
};

export type TodayTravelWindow = {
  startClock: string;
  endClock: string;
  startMins: number;
  endMins: number;
  flightShaped: boolean;
};

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function clockString(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** Resolve Today’s usable work window; stale flight anchors never shape ordinary days. */
export function resolveTodayTravelWindow(args: {
  tripIntent: 'work' | 'personal' | null;
  day: TodayTravelDay | null;
  flightScheduled: boolean;
  workStart: string;
  workEnd: string;
}): TodayTravelWindow {
  const homeStart = clockMinutes(args.workStart);
  const homeEnd = clockMinutes(args.workEnd);
  const flightShaped = args.tripIntent === 'work' && !!args.day && args.flightScheduled;
  if (!flightShaped || !args.day) {
    return {
      startClock: args.workStart,
      endClock: args.workEnd,
      startMins: homeStart,
      endMins: homeEnd,
      flightShaped: false,
    };
  }
  const anchor = resolveScheduledDayAnchor(args.day, true);
  const startMins = Math.max(homeStart, anchor.windowStartMins);
  const endMins = Math.max(startMins, Math.min(homeEnd, anchor.windowEndMins));
  return {
    startClock: clockString(startMins),
    endClock: clockString(endMins),
    startMins,
    endMins,
    flightShaped: true,
  };
}

/** Allocate travel only from capacity left after calendar and meeting commitments. */
export function composeTravelCapacity(
  availableTaskMins: number,
  requestedTravelBlockMins: number,
): { taskCapacity: number; incrementalBlockedMins: number } {
  const available = Math.max(0, availableTaskMins);
  const incrementalBlockedMins = Math.min(available, Math.max(0, requestedTravelBlockMins));
  return {
    taskCapacity: Math.max(0, available - incrementalBlockedMins),
    incrementalBlockedMins,
  };
}

export function todayTravelRegimeLabel(args: {
  tripName: string | null;
  tripIntent: 'work' | 'personal' | null;
  impactMode: 'none' | 'all_day' | 'work_hours' | 'work_block';
}): string | null {
  if (!args.tripName) return null;
  if (args.impactMode === 'all_day' || args.impactMode === 'work_hours') return 'On site today';
  if (args.impactMode === 'work_block') return 'Work stop today';
  return args.tripIntent === 'personal' ? 'Away today' : 'On trip today';
}
