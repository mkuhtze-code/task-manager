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

  // ── V1.1: progressive resolution of short names without a street suffix ──
  it('resolves a bare short name to the fuller street-titled job', () => {
    // "Gladstone" (no street suffix) → the job named "Gladstone Street".
    const parts = parseThought('Gladstone', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Gladstone Street', location_text: '12 Gladstone Street' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
  });

  it('progressively matches a leading fragment of a longer entity name', () => {
    const parts = parseThought('Glads', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Gladstone Street' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('proposed');
    if (res.state === 'proposed') expect(res.candidate.jobId).toBe('j1');
  });

  it('asks which Gladstone when several short-name matches exist', () => {
    const parts = parseThought('Gladstone', TODAY);
    const jobs: Job[] = [
      job({ id: 'j1', name: 'Gladstone Street' }),
      job({ id: 'j2', name: 'Gladstone Road', location_text: '4 Gladstone Road' }),
    ];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('choose');
    if (res.state === 'choose') {
      expect(res.candidates.map((c) => c.jobId).sort()).toEqual(['j1', 'j2']);
    }
  });

  it('does not over-match a short query against an unrelated long token', () => {
    // "at" is too short to be a progressive prefix and matches nothing real.
    const parts = parseThought('meet at 2pm', TODAY);
    const jobs: Job[] = [job({ id: 'j1', name: 'Atlantic Avenue' })];
    const res = resolveJobAndLocation(parts, jobs);
    expect(res.state).toBe('none');
  });
});
