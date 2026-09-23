/**
 * Travel presence → capacity impact.
 *
 * Compliance (SOC 2 / ISO 27001 aligned):
 * - Callers must only pass activities already scoped to the authenticated user.
 * - No network I/O, no logging of location or free-text stop titles.
 * - Pure functions: deterministic, testable, minimal data in memory.
 *
 * Product: Travel stops are presence, not tasks. Only work-shaped presence
 * should shrink Today capacity. Leisure stops do not block the work day.
 */

export type TravelStopPresence = 'all_day' | 'work_hours' | 'fixed' | 'duration';
export type TravelStopKind = 'work' | 'leisure' | 'food' | 'stay' | 'other';

export type TravelPresenceStop = {
  id: string;
  text?: string | null;
  status?: string | null;
  stop_kind?: string | null;
  presence?: string | null;
  estimate_mins?: number | null;
  job_id?: string | null;
};

export type TravelPresenceImpact = {
  /** Minutes to treat as blocked on Today (like meetings). */
  blockedMins: number;
  /** Strongest presence mode found. */
  mode: 'none' | 'all_day' | 'work_hours' | 'work_block';
  /** Count of pending work-relevant stops. */
  workStopCount: number;
  /** Safe short labels for UI (caller may already have titles). */
  summaryLabel: string | null;
};

function isPending(s: TravelPresenceStop): boolean {
  return (s.status || 'pending') !== 'done';
}

function isWorkRelevant(s: TravelPresenceStop): boolean {
  if (!isPending(s)) return false;
  const kind = (s.stop_kind || 'leisure') as TravelStopKind;
  const presence = (s.presence || 'duration') as TravelStopPresence;
  if (kind === 'work') return true;
  // All-day / work-hours without kind still consume the work day
  if (presence === 'all_day' || presence === 'work_hours') return true;
  return false;
}

/**
 * How much of the remaining work window should Travel presence block.
 *
 * @param stops - Activities for *today's* trip day only, already user-scoped
 * @param minutesLeftInWorkWindow - Remaining minutes until work end
 * @param fullWorkWindowMins - Typical work day length (end - start)
 */
export function computeTravelPresenceImpact(
  stops: TravelPresenceStop[],
  minutesLeftInWorkWindow: number,
  fullWorkWindowMins: number
): TravelPresenceImpact {
  const workStops = stops.filter(isWorkRelevant);
  if (workStops.length === 0 || minutesLeftInWorkWindow <= 0) {
    return {
      blockedMins: 0,
      mode: 'none',
      workStopCount: 0,
      summaryLabel: null,
    };
  }

  const hasAllDay = workStops.some((s) => (s.presence || '') === 'all_day');
  if (hasAllDay) {
    return {
      blockedMins: minutesLeftInWorkWindow,
      mode: 'all_day',
      workStopCount: workStops.length,
      summaryLabel: 'On site all day',
    };
  }

  const hasWorkHours = workStops.some((s) => (s.presence || '') === 'work_hours');
  if (hasWorkHours) {
    // Leave a little room for evening flex (matches presenceToSchedule ~85%)
    const block = Math.min(
      minutesLeftInWorkWindow,
      Math.max(Math.round(fullWorkWindowMins * 0.85), 240)
    );
    return {
      blockedMins: block,
      mode: 'work_hours',
      workStopCount: workStops.length,
      summaryLabel: 'Work hours on site',
    };
  }

  // Work stops with duration/fixed: sum estimates (capped by remaining window)
  const sum = workStops.reduce((acc, s) => {
    const m = typeof s.estimate_mins === 'number' && s.estimate_mins > 0 ? s.estimate_mins : 60;
    return acc + m;
  }, 0);
  return {
    blockedMins: Math.min(minutesLeftInWorkWindow, sum),
    mode: 'work_block',
    workStopCount: workStops.length,
    summaryLabel:
      workStops.length === 1 ? 'Work site stop' : `${workStops.length} work site stops`,
  };
}

/** Site-day row for Job ↔ Travel graph (display only; no secrets). */
export type JobSiteDayRow = {
  activityId: string;
  tripId: string;
  tripName: string;
  tripDayId: string;
  date: string;
  stopText: string;
  presence: string | null;
  status: string;
};
