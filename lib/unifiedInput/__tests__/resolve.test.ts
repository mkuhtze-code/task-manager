import { describe, expect, it } from 'vitest';
import { resolveJobAndLocation } from '@/lib/unifiedInput/resolve';
import { parseThought } from '@/lib/unifiedInput/parse';
import type { Job } from '@/lib/jobTypes';

const TODAY = '2026-09-04';

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

describe('resolveJobAndLocation', () => {
  it('proposes the single reliable Belgium Road job', () => {
    const parts = parseThought('Belgium Rd tomorrow at 10am to measure Rainwater Head', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road, Wimbledon', lat: 51.4, lng: -0.2 }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') {
      expect(res.candidate.jobId).toBe('j1');
      expect(res.candidate.jobName).toBe('Belgium Road');
      // Prefer the concrete address for the confirmation prompt.
      expect(res.candidate.matchedField).toBe('location');
      expect(res.candidate.locationText).toBe('14 Belgium Road, Wimbledon');
    }
  });

  it('shows choices when several Belgium Road jobs match', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Belgium Road', location_text: '14 Belgium Road' }),
      job({ id: 'j2', name: 'Belgium Road Extension', location_text: '60 Belgium Road' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('choose');
    if (res.state === 'choose') {
      expect(res.candidates.length).toBe(2);
      expect(res.candidates.map((c) => c.jobId).sort()).toEqual(['j1', 'j2']);
    }
  });

  it('leaves the relationship unresolved when there is no match (never invents)', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Garden Shed' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });

  it('returns none with no jobs', () => {
    const parts = parseThought('Belgium Rd tomorrow to measure Rainwater Head', TODAY);
    const res = resolveJobAndLocation(parts, []);
    expect(res.state).toBe('none');
  });

  it('does not resolve plain task text that names nothing', () => {
    const parts = parseThought('Call the dentist tomorrow', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Belgium Road' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });
});
