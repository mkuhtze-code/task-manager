/**
 * Travel surface model — domain intelligence for the Travel overview.
 * Pure. Deterministic. Not a second Today or Meetings clone.
 *
 * Owns: movement regime (active / ahead / past), day-in-trip,
 * relative starts/ends, pulse & depth language for trip reality.
 */

export type TripPhase = 'active' | 'upcoming' | 'past';

export type TripLike = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at?: string;
};

export type TripRowModel = {
  id: string;
  phase: TripPhase;
  phaseLabel: string;
  pressure: 'now' | 'soon' | 'later' | 'done';
  /** e.g. "Day 2 of 5", "Starts in 3 days", "Ended yesterday" */
  relativeLine: string;
  /** Inclusive night count (calendar span). */
  nightCount: number;
  /** Inclusive day count of the trip. */
  dayCount: number;
  /** 1-based day index when active; null otherwise. */
  dayIndex: number | null;
  daysUntilStart: number | null;
  daysUntilEnd: number | null;
  stopCount: number | null;
};

export type TravelSurfaceModel = {
  todayStr: string;
  rows: Record<string, TripRowModel>;
  active: TripLike[];
  upcoming: TripLike[];
  past: TripLike[];
  next: TripLike | null;
  nextLabel: string | null;
  nextRelative: string | null;
  pulseTitle: string;
  pulseMeta: string;
  pulseAttention: boolean;
  depthRead: string;
  consequenceLine: string | null;
  featured: TripLike | null;
};

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { y: parts[0], m: parts[1], d: parts[2] };
}

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateDiffDays(fromStr: string, toStr: string): number {
  const f = parseYmd(fromStr);
  const t = parseYmd(toStr);
  if (!f || !t) return 0;
  const fromDate = new Date(f.y, f.m - 1, f.d);
  const toDate = new Date(t.y, t.m - 1, t.d);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

export function tripPhase(
  start: string,
  end: string,
  todayStr: string
): TripPhase {
  if (todayStr < start) return 'upcoming';
  if (todayStr > end) return 'past';
  return 'active';
}

export function fmtDateRange(start: string, end: string): string {
  const s = parseYmd(start);
  const e = parseYmd(end);
  if (!s || !e) return `${start} – ${end}`;
  const sDate = new Date(s.y, s.m - 1, s.d);
  const eDate = new Date(e.y, e.m - 1, e.d);
  const sameYear = s.y === e.y;
  const startLabel = sDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endLabel = eDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  if (start === end) {
    return sDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return `${startLabel} – ${endLabel}`;
}

function dayCountInclusive(start: string, end: string): number {
  return Math.max(1, dateDiffDays(start, end) + 1);
}

function classifyTrip(
  trip: TripLike,
  todayStr: string,
  stopCount: number | null
): TripRowModel {
  const phase = tripPhase(trip.start_date, trip.end_date, todayStr);
  const dayCount = dayCountInclusive(trip.start_date, trip.end_date);
  const nightCount = Math.max(0, dayCount - 1);

  if (phase === 'active') {
    const dayIndex = dateDiffDays(trip.start_date, todayStr) + 1;
    const daysLeft = dateDiffDays(todayStr, trip.end_date);
    let relativeLine =
      dayCount === 1
        ? 'Today only'
        : `Day ${dayIndex} of ${dayCount}`;
    if (daysLeft === 0 && dayCount > 1) {
      relativeLine = `Final day · ${dayIndex} of ${dayCount}`;
    } else if (daysLeft === 1 && dayCount > 1) {
      relativeLine = `Day ${dayIndex} of ${dayCount} · ends tomorrow`;
    }
    return {
      id: trip.id,
      phase,
      phaseLabel: daysLeft === 0 && dayCount > 1 ? 'Final day' : 'In motion',
      pressure: 'now',
      relativeLine,
      nightCount,
      dayCount,
      dayIndex,
      daysUntilStart: 0,
      daysUntilEnd: daysLeft,
      stopCount,
    };
  }

  if (phase === 'upcoming') {
    const until = dateDiffDays(todayStr, trip.start_date);
    let relativeLine: string;
    let phaseLabel = 'Upcoming';
    let pressure: TripRowModel['pressure'] = 'later';
    if (until === 0) {
      relativeLine = 'Starts today';
      phaseLabel = 'Starts today';
      pressure = 'soon';
    } else if (until === 1) {
      relativeLine = 'Starts tomorrow';
      phaseLabel = 'Tomorrow';
      pressure = 'soon';
    } else if (until <= 7) {
      relativeLine = `Starts in ${until} days`;
      pressure = until <= 3 ? 'soon' : 'later';
    } else {
      relativeLine = fmtDateRange(trip.start_date, trip.end_date);
    }
    if (dayCount > 1) {
      relativeLine =
        until <= 7
          ? `${relativeLine} · ${dayCount} days`
          : `${relativeLine}`;
    }
    return {
      id: trip.id,
      phase,
      phaseLabel,
      pressure,
      relativeLine,
      nightCount,
      dayCount,
      dayIndex: null,
      daysUntilStart: until,
      daysUntilEnd: null,
      stopCount,
    };
  }

  const ago = dateDiffDays(trip.end_date, todayStr);
  let relativeLine: string;
  if (ago === 0) relativeLine = 'Ended today';
  else if (ago === 1) relativeLine = 'Ended yesterday';
  else if (ago < 14) relativeLine = `Ended ${ago} days ago`;
  else relativeLine = fmtDateRange(trip.start_date, trip.end_date);

  return {
    id: trip.id,
    phase: 'past',
    phaseLabel: 'Past',
    pressure: 'done',
    relativeLine,
    nightCount,
    dayCount,
    dayIndex: null,
    daysUntilStart: null,
    daysUntilEnd: null,
    stopCount,
  };
}

function sortUpcoming(a: TripLike, b: TripLike): number {
  return a.start_date.localeCompare(b.start_date);
}

function sortPast(a: TripLike, b: TripLike): number {
  return b.end_date.localeCompare(a.end_date);
}

/**
 * Build Travel overview model from trips (+ optional stop counts per trip).
 */
export function buildTravelSurfaceModel(params: {
  trips: TripLike[];
  todayStr?: string;
  /** trip_id → planned stop/activity count when known */
  stopCountByTrip?: Record<string, number>;
}): TravelSurfaceModel {
  const todayStr = params.todayStr ?? localDateStr();
  const stopMap = params.stopCountByTrip ?? {};
  const rows: Record<string, TripRowModel> = {};

  const active: TripLike[] = [];
  const upcoming: TripLike[] = [];
  const past: TripLike[] = [];

  for (const t of params.trips) {
    const sc =
      stopMap[t.id] != null && stopMap[t.id] > 0 ? stopMap[t.id] : null;
    const model = classifyTrip(t, todayStr, sc);
    rows[t.id] = model;
    if (model.phase === 'active') active.push(t);
    else if (model.phase === 'upcoming') upcoming.push(t);
    else past.push(t);
  }

  active.sort(sortUpcoming);
  upcoming.sort(sortUpcoming);
  past.sort(sortPast);

  const featured = active[0] ?? upcoming[0] ?? null;
  const next = featured;
  let nextLabel: string | null = null;
  let nextRelative: string | null = null;
  if (next) {
    nextLabel = next.name;
    nextRelative = rows[next.id]?.relativeLine ?? null;
  }

  let pulseTitle: string;
  let pulseMeta: string;
  let pulseAttention = false;

  if (active.length > 0) {
    const r = rows[active[0].id];
    pulseTitle = active.length === 1 ? 'On the move' : `${active.length} trips active`;
    pulseMeta = r
      ? `${active[0].name} · ${r.relativeLine}`
      : active[0].name;
    pulseAttention = true;
  } else if (upcoming.length > 0) {
    const soon = upcoming.filter((t) => rows[t.id]?.pressure === 'soon');
    const focus = soon[0] ?? upcoming[0];
    const r = rows[focus.id];
    pulseTitle =
      soon.length > 0
        ? soon.length === 1
          ? 'Trip approaching'
          : `${soon.length} approaching`
        : upcoming.length === 1
          ? '1 trip ahead'
          : `${upcoming.length} ahead`;
    pulseMeta = r
      ? `${focus.name} · ${r.relativeLine}`
      : focus.name;
    pulseAttention = soon.length > 0;
  } else if (past.length > 0) {
    pulseTitle = 'No trips in motion';
    pulseMeta = 'Earlier travel on file';
  } else {
    pulseTitle = 'No trips yet';
    pulseMeta = 'Plan movement when the work needs it';
  }

  let depthRead: string;
  if (active.length > 0) {
    const r = rows[active[0].id];
    depthRead = r
      ? `${active[0].name} is in motion (${r.relativeLine}). Stops and days stay with the trip — Today should feel the movement, not fight it.`
      : 'A trip is in motion. Keep stops grounded in the plan.';
  } else if (upcoming.some((t) => rows[t.id]?.pressure === 'soon')) {
    const t = upcoming.find((x) => rows[x.id]?.pressure === 'soon')!;
    depthRead = `${t.name} is close. Lock the days you care about before the road starts.`;
  } else if (upcoming.length > 0) {
    depthRead =
      'Nothing is in motion today. Upcoming trips are listed as they start to matter.';
  } else if (past.length > 0) {
    depthRead =
      'No upcoming travel. Past trips stay here so routes and stops don’t vanish.';
  } else {
    depthRead =
      'Travel is for movement that changes what fits — not a second calendar.';
  }

  let consequenceLine: string | null = null;
  if (active.length > 0) {
    const r = rows[active[0].id];
    if (r?.daysUntilEnd === 0) {
      consequenceLine = 'Final day on the road — close loops before you leave the regime.';
    } else {
      consequenceLine =
        'You’re in a travel regime — site time and driving reshape what fits on Today.';
    }
  } else if (upcoming.some((t) => (rows[t.id]?.daysUntilStart ?? 99) <= 2)) {
    consequenceLine = 'Travel starts soon — protect the days that need real stops.';
  }

  return {
    todayStr,
    rows,
    active,
    upcoming,
    past,
    next,
    nextLabel,
    nextRelative,
    pulseTitle,
    pulseMeta,
    pulseAttention,
    depthRead,
    consequenceLine,
    featured,
  };
}
