import { describe, expect, it } from 'vitest';
import {
  parseMeetingInput,
  combineDateAndTime,
  meetingLocalDate,
  fmtMeetingWindow,
  sortMeetingsForOverview,
  parseTimeInput,
  MEETING_DEFAULT_START_HOUR,
} from '@/lib/meetingUtils';
import type { Job } from '@/lib/jobTypes';
import type { Meeting } from '@/lib/meetingTypes';

const TODAY = '2026-09-08';

function job(partial: Partial<Job> & { id: string; name: string }): Job {
  return {
    client: null,
    location_text: null,
    lat: null,
    lng: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function meeting(partial: Partial<Meeting> & { id: string }): Meeting {
  return {
    user_id: 'user-1',
    text: 'Meeting',
    duration_mins: 30,
    start_time: null,
    source: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
    job_id: null,
    location_text: null,
    lat: null,
    lng: null,
    notes: null,
    summary: null,
    ...partial,
  };
}

describe('parseMeetingInput (reuses unified thought input)', () => {
  const jobs = [
    job({ id: 'job-1', name: 'Belgium Realty', location_text: '14 Belgium Road' }),
  ];

  it('resolves date, time, location hint and job from one thought', () => {
    const preview = parseMeetingInput('Meeting with Tim at Belgium Rd tomorrow at 2pm', jobs, TODAY);
    expect(preview.title).toBe('Meeting with Tim');
    expect(preview.date).toBe('2026-09-09');
    expect(preview.clock?.hour).toBe(14);
    expect(preview.clock?.minute).toBe(0);
    expect(preview.locationHint).toBe('Belgium Rd');
    expect(preview.hadFacets).toBe(true);
    if (preview.resolution.state === 'proposed') {
      expect(preview.resolution.candidate.jobId).toBe('job-1');
      expect(preview.resolution.candidate.locationText).toBe('14 Belgium Road');
    } else {
      throw new Error('expected a proposed Belgium Realty resolution');
    }
  });

  it('keeps the full meeting phrase in the title when nothing else is consumed', () => {
    const preview = parseMeetingInput('Meeting with Tim tomorrow', jobs, TODAY);
    expect(preview.title).toBe('Meeting with Tim');
    expect(preview.date).toBe('2026-09-09');
    expect(preview.clock).toBeNull();
    expect(preview.resolution.state).toBe('none');
  });

  it('falls back to the raw input when intent is empty', () => {
    const preview = parseMeetingInput('tomorrow at 2pm', jobs, TODAY);
    expect(preview.title).toBe('tomorrow at 2pm');
    expect(preview.hadFacets).toBe(true);
  });

  it('handles empty input', () => {
    const preview = parseMeetingInput('   ', [], TODAY);
    expect(preview.title).toBe('');
    expect(preview.date).toBeNull();
    expect(preview.clock).toBeNull();
    expect(preview.resolution.state).toBe('none');
    expect(preview.hadFacets).toBe(false);
  });

  it('resolves a suffix-less place by name (entity resolution works on its own)', () => {
    const preview = parseMeetingInput('Meeting with Tim at Belgium tomorrow at 2pm', jobs, TODAY);
    expect(preview.title).toBe('Meeting with Tim at Belgium');
    expect(preview.date).toBe('2026-09-09');
    expect(preview.clock?.hour).toBe(14);
    expect(preview.locationHint).toBeNull();
    // "Belgium" matches the job name "Belgium Realty" (0.5 ≥ 0.34), so the
    // meeting proposes the job even though nothing looks like a road.
    if (preview.resolution.state === 'proposed') {
      expect(preview.resolution.candidate.jobName).toBe('Belgium Realty');
    } else {
      throw new Error('expected a proposed Belgium Realty resolution');
    }
  });
});

describe('combineDateAndTime', () => {
  it('builds a local ISO instant from date + clock', () => {
    const iso = combineDateAndTime('2026-09-08', { hour: 14, minute: 5, label: '14:05' });
    expect(iso).toMatch(/Z$/);
    const d = new Date(iso!);
    expect(isNaN(d.getTime())).toBe(false);
    expect(meetingLocalDate(iso)).toBe('2026-09-08');
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(5);
  });

  it('defaults a date-only meeting to 9am', () => {
    const iso = combineDateAndTime('2026-09-08', null);
    const d = new Date(iso!);
    expect(d.getHours()).toBe(MEETING_DEFAULT_START_HOUR);
    expect(d.getMinutes()).toBe(0);
  });

  it('rejects a malformed date', () => {
    expect(combineDateAndTime('not-a-date', null)).toBeNull();
  });
});

describe('parseTimeInput', () => {
  it('parses an HTML time value', () => {
    const clock = parseTimeInput('14:30');
    expect(clock?.hour).toBe(14);
    expect(clock?.minute).toBe(30);
    expect(clock?.label).toBe('14:30');
  });

  it('rejects malformed values', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('25:00')).toBeNull();
    expect(parseTimeInput('banana')).toBeNull();
  });
});

describe('fmtMeetingWindow', () => {
  it('labels an unspecified window as anytime', () => {
    expect(fmtMeetingWindow(null, 30)).toBe('Anytime');
  });

  it('renders a start → end window', () => {
    const iso = combineDateAndTime('2026-09-08', { hour: 14, minute: 0, label: '14:00' });
    const label = fmtMeetingWindow(iso, 60);
    expect(label).toContain('2p');
    expect(label).toContain('→');
    expect(label).toContain('3p');
  });

  it('handles an invalid timestamp', () => {
    expect(fmtMeetingWindow('garbage', 30)).toBe('');
  });
});

describe('sortMeetingsForOverview', () => {
  it('groups upcoming vs past and leads with unspecified windows', () => {
    const meetings = [
      meeting({ id: 'b', start_time: '2999-01-01T00:00:00.000Z', created_at: '2026-01-02T00:00:00.000Z' }),
      meeting({ id: 'a-flex' }),
      meeting({ id: 'c-past', start_time: '2000-01-01T00:00:00.000Z', created_at: '2026-01-03T00:00:00.000Z' }),
      meeting({ id: 'd-flex', created_at: '2026-08-01T00:00:00.000Z' }),
    ];
    const { upcoming, past } = sortMeetingsForOverview(meetings);
    expect(upcoming.map((m) => m.id)).toEqual(['d-flex', 'a-flex', 'b']);
    expect(past.map((m) => m.id)).toEqual(['c-past']);
  });

  it('handles an empty list', () => {
    const { upcoming, past } = sortMeetingsForOverview([]);
    expect(upcoming).toEqual([]);
    expect(past).toEqual([]);
  });
});