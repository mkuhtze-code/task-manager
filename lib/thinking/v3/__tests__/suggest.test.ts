import { describe, it, expect } from 'vitest';
import { suggestEstimateV3, MIN_SAMPLES_FOR_SUGGESTION } from '../suggest';

describe('suggestEstimateV3', () => {
  const updatedAt = '2026-09-28T12:00:00.000Z';

  it('returns null for empty text', () => {
    expect(suggestEstimateV3('', [], { updatedAt })).toBeNull();
  });

  it('returns null with insufficient samples', () => {
    const history = [
      { text: 'Wire frame review', actual_mins: 40 },
    ];
    expect(
      suggestEstimateV3('Wire frame review', history, { updatedAt })
    ).toBeNull();
  });

  it('suggests median-based duration for matched cluster', () => {
    const history = [
      { text: 'Site measure access', actual_mins: 55 },
      { text: 'Site measure access', actual_mins: 65 },
      { text: 'Site measure access', actual_mins: 60 },
      { text: 'Site measure access', actual_mins: 58 },
    ];
    const s = suggestEstimateV3('Site measure access', history, { updatedAt });
    expect(s).not.toBeNull();
    expect(s!.sampleCount).toBeGreaterThanOrEqual(MIN_SAMPLES_FOR_SUGGESTION);
    expect(s!.suggestedMins).toBeGreaterThanOrEqual(55);
    expect(s!.suggestedMins).toBeLessThanOrEqual(65);
    expect(s!.source).toBe('measured');
    expect(s!.modelVersion).toBeTruthy();
  });

  it('uses job context when enough samples', () => {
    const history = [];
    for (let i = 0; i < 4; i++) {
      history.push({
        text: 'Punch list walk',
        actual_mins: 90,
        job_id: 'job-long',
      });
    }
    for (let i = 0; i < 4; i++) {
      history.push({
        text: 'Punch list walk',
        actual_mins: 30,
        job_id: 'job-short',
      });
    }
    const long = suggestEstimateV3('Punch list walk', history, {
      updatedAt,
      context: { jobId: 'job-long' },
    });
    const short = suggestEstimateV3('Punch list walk', history, {
      updatedAt,
      context: { jobId: 'job-short' },
    });
    expect(long).not.toBeNull();
    expect(short).not.toBeNull();
    expect(long!.suggestedMins).toBeGreaterThan(short!.suggestedMins);
  });
});
