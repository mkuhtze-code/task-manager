import type { Job } from '@/lib/jobTypes';
import type { Meeting } from '@/lib/meetingTypes';
import { parseThought, type ParsedClock } from '@/lib/unifiedInput/parse';
import { resolveJobAndLocation, type JobLocationResolution } from '@/lib/unifiedInput/resolve';
import { localDateStr, fmtClock } from '@/lib/timeFormat';

// ── Meeting-time helpers ──────────────────────────────────────────────
// start_time is a timestamptz. The user thinks in local date + clock; we set
// the instant from local components so Today's capacity math sees the right
// local block. When a date is given but no clock, the meeting defaults to
// 9am so it still occupies a real, honest time window rather than a null
// start_time (which Today always counts as "today").
export const MEETING_DEFAULT_START_HOUR = 9;

// Turns an <input type="time"> value ("14:30") into a ParsedClock, or null.
export function parseTimeInput(v: string): ParsedClock | null {
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, label: String(v).trim() };
}

export function combineDateAndTime(dateStr: string, clock: ParsedClock | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d, clock ? clock.hour : MEETING_DEFAULT_START_HOUR, clock ? clock.minute : 0);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// Local YYYY-MM-DD for a meeting's start, or null when the meeting has no
// start_time (an unspecified window — Today treats those as always valid).
export function meetingLocalDate(startTime: string | null): string | null {
  if (!startTime) return null;
  const d = new Date(startTime);
  return isNaN(d.getTime()) ? null : localDateStr(d);
}

export function fmtMeetingWindow(startTime: string | null, durationMins: number): string {
  if (!startTime) return 'Anytime';
  const d = new Date(startTime);
  if (isNaN(d.getTime())) return '';
  const start = d.getHours() * 60 + d.getMinutes();
  const end = (start + Math.max(0, Math.round(durationMins))) % (24 * 60);
  const startLabel = fmtClock(String(Math.floor(start / 60)) + ':' + String(start % 60));
  const endLabel = fmtClock(String(Math.floor(end / 60)) + ':' + String(end % 60));
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${weekday} · ${startLabel} → ${endLabel}`;
}

export type MeetingOverview = {
  upcoming: Meeting[];
  past: Meeting[];
};

// Unspecified-window meetings (null start_time) read as flexible/"today" and
// lead the upcoming group (newest capture first). Dated meetings sort by the
// actual instant — soonest first, and past meetings newest first.
export function sortMeetingsForOverview(meetings: Meeting[]): MeetingOverview {
  const now = Date.now();
  const upcoming: Meeting[] = [];
  const past: Meeting[] = [];
  for (const m of meetings) {
    if (m.start_time === null) {
      upcoming.push(m);
    } else {
      const t = new Date(m.start_time).getTime();
      if (!isNaN(t) && t < now) past.push(m);
      else upcoming.push(m);
    }
  }
  upcoming.sort((a, b) => {
    if (a.start_time === null && b.start_time === null) return b.created_at.localeCompare(a.created_at);
    if (a.start_time === null) return -1;
    if (b.start_time === null) return 1;
    return a.start_time.localeCompare(b.start_time);
  });
  past.sort((a, b) => b.start_time!.localeCompare(a.start_time!));
  return { upcoming, past };
}

// ── Unified thought input reuse ───────────────────────────────────────
// Meetings use the SAME deterministic parser as tasks — no duplicate parser.
// "Meeting with Tim at Belgium Rd tomorrow at 2pm" resolves to
// title "Meeting with Tim", tomorrow, 14:00, location hint "Belgium Rd",
// and a job/location resolution against real jobs.
export type MeetingCapturePreview = {
  title: string;
  date: string | null;
  clock: ParsedClock | null;
  locationHint: string | null;
  resolution: JobLocationResolution;
  hadFacets: boolean;
};

export function parseMeetingInput(
  raw: string,
  jobs: Job[],
  today: string = localDateStr(new Date()),
): MeetingCapturePreview {
  const parts = parseThought(raw, today);
  const title = (parts.intent && parts.intent.length > 0 ? parts.intent : raw.trim());
  return {
    title,
    date: parts.date,
    clock: parts.time,
    locationHint: parts.locationHint,
    resolution: resolveJobAndLocation(parts, jobs),
    hadFacets: parts.hadFacets,
  };
}