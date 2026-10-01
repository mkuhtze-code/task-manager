/**
 * Meetings surface model — domain intelligence for the Meetings overview.
 * Pure. Deterministic. Not a second Today scheduler.
 *
 * Owns: conversation timing, day pressure from meetings, open loops left behind.
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
};

export type MeetingsSurfaceModel = {
  now: Date;
  rows: Record<string, MeetingRowModel>;
  live: Meeting[];
  today: Meeting[];
  upcoming: Meeting[];
  flexible: Meeting[];
  past: Meeting[];
  /** Meetings that start or are live today (excludes flexible). */
  todayLoadMins: number;
  openLoopCount: number;
  next: Meeting | null;
  nextLabel: string | null;
  pulseTitle: string;
  pulseMeta: string;
  pulseAttention: boolean;
  depthRead: string;
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
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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

  if (!meeting.start_time) {
    return {
      id: meeting.id,
      phase: 'flexible',
      phaseLabel: 'Unscheduled',
      pressure: openActionCount > 0 ? 'open' : 'open',
      startMs: null,
      endMs: null,
      durationMins,
      hasNotes,
      hasSummary,
      openActionCount,
      leavesBehind,
    };
  }

  const startMs = new Date(meeting.start_time).getTime();
  if (Number.isNaN(startMs)) {
    return {
      id: meeting.id,
      phase: 'flexible',
      phaseLabel: 'Unscheduled',
      pressure: 'open',
      startMs: null,
      endMs: null,
      durationMins,
      hasNotes,
      hasSummary,
      openActionCount,
      leavesBehind,
    };
  }

  const endMs = startMs + durationMins * 60000;
  const nowMs = now.getTime();
  const today = localYmd(now);
  const mDay = meetingLocalDate(meeting.start_time);

  if (nowMs >= startMs && nowMs < endMs) {
    return {
      id: meeting.id,
      phase: 'live',
      phaseLabel: 'Happening',
      pressure: 'now',
      startMs,
      endMs,
      durationMins,
      hasNotes,
      hasSummary,
      openActionCount,
      leavesBehind,
    };
  }

  if (nowMs >= endMs || (mDay != null && mDay < today)) {
    return {
      id: meeting.id,
      phase: 'past',
      phaseLabel: openActionCount > 0 ? 'Needs follow-up' : 'Past',
      pressure: openActionCount > 0 ? 'open' : 'done',
      startMs,
      endMs,
      durationMins,
      hasNotes,
      hasSummary,
      openActionCount,
      leavesBehind,
    };
  }

  if (mDay === today) {
    const minsUntil = Math.round((startMs - nowMs) / 60000);
    return {
      id: meeting.id,
      phase: 'today',
      phaseLabel: minsUntil <= 60 ? 'Soon' : 'Today',
      pressure: minsUntil <= 90 ? 'soon' : 'later',
      startMs,
      endMs,
      durationMins,
      hasNotes,
      hasSummary,
      openActionCount,
      leavesBehind,
    };
  }

  return {
    id: meeting.id,
    phase: 'upcoming',
    phaseLabel: 'Upcoming',
    pressure: 'later',
    startMs,
    endMs,
    durationMins,
    hasNotes,
    hasSummary,
    openActionCount,
    leavesBehind,
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
  if (next) {
    const r = rows[next.id];
    if (r.phase === 'live') {
      nextLabel = `Now · ${next.text}`;
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
    pulseTitle = 'In a meeting';
    pulseMeta = live[0].text;
    pulseAttention = true;
  } else if (today.length > 0) {
    pulseTitle =
      today.length === 1
        ? '1 meeting today'
        : `${today.length} meetings today`;
    pulseMeta = nextLabel
      ? `Next ${nextLabel}`
      : `${fmtDur(todayLoadMins)} on the clock`;
    pulseAttention = today.some((m) => rows[m.id]?.pressure === 'soon');
  } else if (upcoming.length > 0 || flexible.length > 0) {
    const n = upcoming.length + flexible.length;
    pulseTitle = n === 1 ? '1 ahead' : `${n} ahead`;
    pulseMeta = nextLabel ? `Next ${nextLabel}` : 'Nothing today';
  } else if (past.length > 0) {
    pulseTitle = 'Nothing scheduled';
    pulseMeta =
      openLoopCount > 0
        ? `${openLoopCount} open follow-up${openLoopCount === 1 ? '' : 's'}`
        : 'Past meetings on file';
  } else {
    pulseTitle = 'No meetings yet';
    pulseMeta = 'Record what was said when it matters';
  }

  if (openLoopCount > 0 && live.length === 0) {
    pulseAttention = pulseAttention || openLoopCount >= 2;
  }

  let depthRead: string;
  if (live.length > 0) {
    depthRead =
      'A meeting is in progress. Capture while it’s fresh — follow-ups belong to the meeting, not the clock.';
  } else if (todayLoadMins > 0) {
    depthRead = `Today holds about ${fmtDur(
      todayLoadMins
    )} of meeting time. That time is fixed; the rest of the day has to work around it.`;
  } else if (openLoopCount > 0) {
    depthRead = `${openLoopCount} follow-up${
      openLoopCount === 1 ? '' : 's'
    } still open from earlier conversations. Closing them is what makes meetings useful.`;
  } else if (upcoming.length + flexible.length > 0) {
    depthRead =
      'Nothing meeting-shaped is on today. Upcoming conversations are listed when they start to matter.';
  } else if (past.length > 0) {
    depthRead =
      'No upcoming meetings. Past conversations stay here so decisions and notes don’t vanish.';
  } else {
    depthRead =
      'Meetings are for what was said and what it leaves behind — not another calendar.';
  }

  return {
    now,
    rows,
    live,
    today,
    upcoming,
    flexible,
    past,
    todayLoadMins,
    openLoopCount,
    next,
    nextLabel,
    pulseTitle,
    pulseMeta,
    pulseAttention,
    depthRead,
  };
}
