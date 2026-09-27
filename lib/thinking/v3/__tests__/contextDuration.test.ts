import { describe, it, expect } from 'vitest';
import { buildPersonalModel } from '../model';
import {
  lookupContextualDuration,
  placeKey,
  classifyDayPeriod,
  MIN_CONTEXT_SAMPLES,
} from '../contextDuration';
import type { HistorySample } from '../clusters';

describe('context-conditional duration', () => {
  const updatedAt = '2026-09-28T12:00:00.000Z';

  it('placeKey normalizes', () => {
    expect(placeKey('  12 Main St.  ')).toBe('12 main st');
    expect(placeKey(null)).toBeNull();
  });

  it('classifyDayPeriod buckets hours', () => {
    expect(classifyDayPeriod(8)).toBe('morning');
    expect(classifyDayPeriod(14)).toBe('afternoon');
    expect(classifyDayPeriod(null)).toBeNull();
  });

  it('uses cluster+job when enough samples', () => {
    const samples: HistorySample[] = [];
    for (let i = 0; i < 4; i++) {
      samples.push({
        text: 'Site measure access',
        actualMins: 60,
        jobId: 'job-a',
        createdAt: `2026-01-0${i + 1}T10:00:00Z`,
        completedAt: `2026-01-0${i + 1}T11:00:00Z`,
      });
    }
    for (let i = 0; i < 4; i++) {
      samples.push({
        text: 'Site measure access',
        actualMins: 30,
        jobId: 'job-b',
        createdAt: `2026-02-0${i + 1}T10:00:00Z`,
        completedAt: `2026-02-0${i + 1}T11:00:00Z`,
      });
    }
    const model = buildPersonalModel({ userId: 'u1', samples, updatedAt });
    const withA = lookupContextualDuration(
      'Site measure access',
      model,
      samples,
      { jobId: 'job-a' }
    );
    const withB = lookupContextualDuration(
      'Site measure access',
      model,
      samples,
      { jobId: 'job-b' }
    );
    expect(withA.level).toBe('cluster_job');
    expect(withB.level).toBe('cluster_job');
    expect(withA.distribution.expectedMins).toBeGreaterThan(
      withB.distribution.expectedMins
    );
  });

  it('does not promote weak context slices', () => {
    const samples: HistorySample[] = [
      {
        text: 'Invoice client',
        actualMins: 45,
        jobId: 'job-rare',
        locationText: 'Unique Place Only',
      },
      {
        text: 'Invoice client',
        actualMins: 40,
        jobId: 'job-other',
      },
      {
        text: 'Invoice client',
        actualMins: 42,
        jobId: 'job-other',
      },
    ];
    const model = buildPersonalModel({ userId: 'u1', samples, updatedAt });
    const d = lookupContextualDuration('Invoice client', model, samples, {
      jobId: 'job-rare',
      locationText: 'Unique Place Only',
    });
    expect(d.level === 'cluster_job' || d.level === 'cluster_place').toBe(false);
    expect(d.distribution.sampleSize).toBeGreaterThanOrEqual(1);
  });

  it('MIN_CONTEXT_SAMPLES is at least 3', () => {
    expect(MIN_CONTEXT_SAMPLES).toBeGreaterThanOrEqual(3);
  });
});
