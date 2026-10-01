/**
 * Meetings surface model — domain intelligence for the Meetings overview.
 * Pure. Deterministic. Not a second Today scheduler.
 *
 * Owns: conversation timing, day pressure from meetings, open loops left behind.
 * Presentation-grade: relative time, consequence language, quiet authority.
 */

import type { Meeting } from '@/lib/meetingTypes';
import { meetingLocalDate } from '@/lib/meetingUtils';

export type MeetingPhase =
  | 'live'
  | 'today'
  | 'upcoming'
  | 'flexible'
  | 'past';

export type MeetingRowModel = {
  id: string;
  phase: MeetingPhase;
  phaseLabel: string;
  /** Quiet state for the row (not traffic lights). */
  pressure: 'now' | 'soon' | 'later' | 'done' | 'open';
  startMs: number | null;
  endMs: number | null;
  durationMins: number;
  hasNotes: boolean;
  hasSummary: boolean;
  openActionCount: number;
  /** True when something still needs follow-through. */
  leavesBehind: boolean;
  /**
   * Human relative line for the row aside / subline.
   * e.g. "Ends in 12m", "In 40m", "Tomorrow · 09:30", "Wed · 14:00"
   */
  relativeLine: string | null;
  /** Minutes until start (future) or until end (live); null if unknown/past. */
  minsToBoundary: number | null;
};

export type MeetingsSurfaceModel = {
  now: Date;
  rows: Record<string, MeetingRowModel>;
  live: Meeting[];
  today: Meeting[];
  upcoming: Meeting[];
  flexible: Meeting[];
  past: Meeting[];
  /** Past meetings with open follow-ups — deserve attention. */
  pastNeedingFollowUp: Meeting[];
  /** Meetings that start or are live today (excludes flexible). */
  todayLoadMins: number;
  openLoopCount: number;
  next: Meeting | null;
  nextLabel: string | null;
  /** Short line under pulse for the next conversation. */
  nextRelative: string | null;
  pulseTitle: string;
  pulseMeta: string;
  pulseAttention: boolean;
  depthRead: string;
  /** One-line consequence for depth / mobile. */
  consequenceLine: string | null;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

function fmtDur(mins: number): string {
  const n = Math.max(0, Math.round(mins));
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dayDelta(from: Date, toYmd: string): number | null {
  const [y, mo, d] = toYmd.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const target = new Date(from);
  target.setFullYear(y, mo - 1, d);
  target.setHours(0, 0, 0, 0);
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function relativeDayLabel(now: Date, startMs: number): string {
  const ymd = localYmd(new Date(startMs));
  const delta = dayDelta(now, ymd);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta != null && delta > 1 && delta < 7) {
    return WEEKDAYS[new Date(startMs).getDay()];
  }
  const d = new Date(startMs);
  return `${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
}

function buildRelativeLine(
  phase: MeetingPhase,
  startMs: number | null,
  endMs: number | null,
  nowMs: number,
  now: Date
): { line: string | null; minsToBoundary: number | null } {
  if (phase === 'live' && endMs != null) {
    const left = Math.max(0, Math.round((endMs - nowMs) / 60000));
    return {
      line: left <= 0 ? 'Ending' : `Ends in ${fmtDur(left)}`,
      minsToBoundary: left,
    };
  }
  if (startMs == null) {
    return { line: 'No fixed time', minsToBoundary: null };
  }
  if (phase === 'past') {
    return {
      line: relativeDayLabel(now, startMs),
      minsToBoundary: null,
    };
  }
  const until = Math.round((startMs - nowMs) / 60000);
  if (until <= 0) {
    return { line: 'Starting', minsToBoundary: 0 };
  }
  if (until < 24 * 60) {
    const day = relativeDayLabel(now, startMs);
    if (day === 'Today' || until <= 12 * 60) {
      return {
        line: until < 60 ? `In ${until}m` : `In ${fmtDur(until)}`,
        minsToBoundary: until,
      };
    }
    return {
      line: `${day} · ${clockLabel(startMs)}`,
      minsToBoundary: until,
    };
  }
  return {
    line: `${relativeDayLabel(now, startMs)} · ${clockLabel(startMs)}`,
    minsToBoundary: until,
  };
}

/**
 * Classify one meeting relative to now.
 */
export function classifyMeeting(
  meeting: Meeting,
  now: Date,
  openActionCount = 0
): MeetingRowModel {
  const durationMins = Math.max(0, meeting.duration_mins || 0);
  const hasNotes = Boolean(meeting.notes && meeting.notes.trim());
  const hasSummary = Boolean(meeting.summary && meeting.summary.trim());
  const leavesBehind =
    openActionCount > 0 || hasNotes || hasSummary;
  const nowMs = now.getTime();

  const base = {
    id: meeting.id,
    durationMins,
    hasNotes,
    hasSummary,
    openActionCount,
    leavesBehind,
  };

  if (!meeting.start_time) {
    return {
      ...base,
      phase: 'flexible',
      phaseLabel: 'Unscheduled',
      pressure: openActionCount > 0 ? 'open' : 'open',
      startMs: null,
      endMs: null,
      relativeLine: 'No fixed time',
      minsToBoundary: null,
    };
  }

  const startMs = new Date(meeting.start_time).getTime();
  if (Number.isNaN(startMs)) {
    return {
      ...base,
      phase: 'flexible',
      phaseLabel: 'Unscheduled',
      pressure: 'open',
      startMs: null,
      endMs: null,
      relativeLine: 'No fixed time',
      minsToBoundary: null,
    };
  }

  const endMs = startMs + durationMins * 60000;
  const today = localYmd(now);
  const mDay = meetingLocalDate(meeting.start_time);

  if (nowMs >= startMs && nowMs < endMs) {
    const rel = buildRelativeLine('live', startMs, endMs, nowMs, now);
    return {
      ...base,
      phase: 'live',
      phaseLabel: 'Happening',
      pressure: 'now',
      startMs,
      endMs,
      relativeLine: rel.line,
      minsToBoundary: rel.minsToBoundary,
    };
  }

  if (nowMs >= endMs || (mDay != null && mDay < today)) {
    const rel = buildRelativeLine('past', startMs, endMs, nowMs, now);
    return {
      ...base,
      phase: 'past',
      phaseLabel: openActionCount > 0 ? 'Needs follow-up' : 'Past',
      pressure: openActionCount > 0 ? 'open' : 'done',
      startMs,
      endMs,
      relativeLine: rel.line,
      minsToBoundary: null,
    };
  }

  if (mDay === today) {
    const minsUntil = Math.round((startMs - nowMs) / 60000);
    const rel = buildRelativeLine('today', startMs, endMs, nowMs, now);
    return {
      ...base,
      phase: 'today',
      phaseLabel: minsUntil <= 60 ? 'Soon' : 'Today',
      pressure: minsUntil <= 90 ? 'soon' : 'later',
      startMs,
      endMs,
      relativeLine: rel.line,
      minsToBoundary: rel.minsToBoundary,
    };
  }

  const rel = buildRelativeLine('upcoming', startMs, endMs, nowMs, now);
  return {
    ...base,
    phase: 'upcoming',
    phaseLabel: 'Upcoming',
    pressure: 'later',
    startMs,
    endMs,
    relativeLine: rel.line,
    minsToBoundary: rel.minsToBoundary,
  };
}

function sortByStart(a: Meeting, b: Meeting): number {
  if (!a.start_time && !b.start_time) {
    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    );
  }
  if (!a.start_time) return -1;
  if (!b.start_time) return 1;
  return (
    new Date(a.start_time).getTime() -
    new Date(b.start_time).getTime()
  );
}

function sortPast(a: Meeting, b: Meeting): number {
  if (!a.start_time && !b.start_time) {
    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    );
  }
  if (!a.start_time) return 1;
  if (!b.start_time) return -1;
  return (
    new Date(b.start_time).getTime() -
    new Date(a.start_time).getTime()
  );
}

/**
 * Build the Meetings surface model from rows + optional open-action counts.
 */
export function buildMeetingsSurfaceModel(params: {
  meetings: Meeting[];
  now?: Date;
  /** meeting_id → count of actions not yet promoted to a task */
  openActionsByMeeting?: Record<string, number>;
}): MeetingsSurfaceModel {
  const now = params.now ?? new Date();
  const openMap = params.openActionsByMeeting ?? {};
  const rows: Record<string, MeetingRowModel> = {};

  const live: Meeting[] = [];
  const today: Meeting[] = [];
  const upcoming: Meeting[] = [];
  const flexible: Meeting[] = [];
  const past: Meeting[] = [];

  for (const m of params.meetings) {
    const model = classifyMeeting(m, now, openMap[m.id] ?? 0);
    rows[m.id] = model;
    switch (model.phase) {
      case 'live':
        live.push(m);
        break;
      case 'today':
        today.push(m);
        break;
      case 'upcoming':
        upcoming.push(m);
        break;
      case 'flexible':
        flexible.push(m);
        break;
      case 'past':
        past.push(m);
        break;
    }
  }

  live.sort(sortByStart);
  today.sort(sortByStart);
  upcoming.sort(sortByStart);
  flexible.sort(sortByStart);
  past.sort(sortPast);

  const pastNeedingFollowUp = past.filter(
    (m) => (rows[m.id]?.openActionCount ?? 0) > 0
  );

  const todayLoadMins = [...live, ...today].reduce(
    (s, m) => s + Math.max(0, m.duration_mins || 0),
    0
  );

  const openLoopCount = Object.values(rows).reduce(
    (s, r) => s + (r.openActionCount > 0 ? r.openActionCount : 0),
    0
  );

  const next = live[0] ?? today[0] ?? upcoming[0] ?? flexible[0] ?? null;
  let nextLabel: string | null = null;
  let nextRelative: string | null = null;
  if (next) {
    const r = rows[next.id];
    nextRelative = r.relativeLine;
    if (r.phase === 'live') {
      nextLabel = next.text;
    } else if (r.startMs != null) {
      nextLabel = `${clockLabel(r.startMs)} · ${next.text}`;
    } else {
      nextLabel = next.text;
    }
  }

  let pulseTitle: string;
  let pulseMeta: string;
  let pulseAttention = false;

  if (live.length > 0) {
    const r = rows[live[0].id];
    pulseTitle = 'In conversation';
    pulseMeta = r.relativeLine
      ? `${live[0].text} · ${r.relativeLine}`
      : live[0].text;
    pulseAttention = true;
  } else if (today.length > 0) {
    const soon = today.filter((m) => rows[m.id]?.pressure === 'soon');
    pulseTitle =
      today.length === 1
        ? '1 conversation today'
        : `${today.length} conversations today`;
    if (soon.length > 0 && rows[soon[0].id]?.relativeLine) {
      pulseMeta = `${soon[0].text} · ${rows[soon[0].id].relativeLine}`;
      pulseAttention = true;
    } else if (nextLabel) {
      pulseMeta = nextRelative
        ? `Next · ${nextRelative}`
        : `Next · ${nextLabel}`;
    } else {
      pulseMeta = `${fmtDur(todayLoadMins)} on the clock`;
    }
  } else if (upcoming.length > 0 || flexible.length > 0) {
    const n = upcoming.length + flexible.length;
    pulseTitle = n === 1 ? '1 ahead' : `${n} ahead`;
    pulseMeta = nextRelative
      ? `Next · ${nextRelative}`
      : nextLabel
        ? `Next · ${nextLabel}`
        : 'Nothing today';
  } else if (pastNeedingFollowUp.length > 0) {
    pulseTitle = 'Follow-ups waiting';
    pulseMeta = `${openLoopCount} open from earlier conversations`;
    pulseAttention = true;
  } else if (past.length > 0) {
    pulseTitle = 'Nothing scheduled';
    pulseMeta = 'Earlier conversations on file';
  } else {
    pulseTitle = 'No conversations yet';
    pulseMeta = 'Record what was said when it matters';
  }

  let depthRead: string;
  if (live.length > 0) {
    depthRead =
      'A conversation is in progress. Capture while it’s fresh — decisions and follow-ups belong here, not lost in the day.';
  } else if (todayLoadMins >= 120) {
    depthRead = `Today holds about ${fmtDur(
      todayLoadMins
    )} of fixed conversation time. The rest of the day has to work around it.`;
  } else if (todayLoadMins > 0) {
    depthRead = `About ${fmtDur(
      todayLoadMins
    )} of meeting time is already spoken for today.`;
  } else if (openLoopCount > 0) {
    depthRead = `${openLoopCount} follow-up${
      openLoopCount === 1 ? '' : 's'
    } still open from earlier conversations. Closing them is what makes meetings useful.`;
  } else if (upcoming.length + flexible.length > 0) {
    depthRead =
      'Nothing meeting-shaped is on today. Upcoming conversations appear as they start to matter.';
  } else if (past.length > 0) {
    depthRead =
      'No upcoming meetings. Past conversations stay here so decisions and notes don’t vanish.';
  } else {
    depthRead =
      'Meetings are for what was said and what it leaves behind — not another calendar.';
  }

  let consequenceLine: string | null = null;
  if (live.length > 0) {
    consequenceLine = 'Capture now — follow-ups stay with this meeting.';
  } else if (openLoopCount > 0 && today.length === 0) {
    consequenceLine = `${openLoopCount} open loop${
      openLoopCount === 1 ? '' : 's'
    } still need a home on Today.`;
  } else if (todayLoadMins >= 90) {
    consequenceLine = 'Heavy meeting load — protect focus around these blocks.';
  } else if (
    today.some((m) => rows[m.id]?.pressure === 'soon')
  ) {
    consequenceLine = 'Something starts soon — leave a clean gap before it.';
  }

  return {
    now,
    rows,
    live,
    today,
    upcoming,
    flexible,
    past,
    pastNeedingFollowUp,
    todayLoadMins,
    openLoopCount,
    next,
    nextLabel,
    nextRelative,
    pulseTitle,
    pulseMeta,
    pulseAttention,
    depthRead,
    consequenceLine,
  };
}
