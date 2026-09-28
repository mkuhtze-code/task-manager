import { describe, it, expect } from 'vitest';
import {
  buildMultiChannelModel,
  beliefSamplesFromHistory,
} from '../beliefs';

describe('FP-1 multi-channel beliefs', () => {
  it('builds global duration from clean samples only', () => {
    const samples = beliefSamplesFromHistory([
      {
        text: 'Send invoice Acme',
        actual_mins: 20,
        created_at: '2026-01-01T10:00:00Z',
        completed_at: '2026-01-01T10:30:00Z',
        outcome_kind: 'done',
      },
      {
        text: 'Send invoice Acme',
        actual_mins: 25,
        created_at: '2026-01-02T10:00:00Z',
        completed_at: '2026-01-02T10:40:00Z',
        outcome_kind: 'done',
      },
      {
        text: 'Send invoice Acme',
        actual_mins: 5,
        created_at: '2026-01-03T10:00:00Z',
        completed_at: '2026-01-03T18:00:00Z',
        outcome_channel: 'interrupted',
      },
    ]);
    // mark interrupted channel on third
    samples[2].outcomeChannel = 'interrupted';

    const model = buildMultiChannelModel({
      userId: 'u1',
      samples,
      updatedAt: '2026-01-04T00:00:00Z',
    });

    expect(model.global.cleanSampleCount).toBe(2);
    expect(model.global.durationMins).toBeGreaterThanOrEqual(20);
    expect(model.global.durationMins).toBeLessThanOrEqual(25);
    expect(model.global.authority).toBe('early');
  });

  it('carry hazard rises when multi-day completions dominate', () => {
    const samples = beliefSamplesFromHistory([
      {
        text: 'Deep report',
        actual_mins: 120,
        created_at: '2026-01-01T10:00:00Z',
        completed_at: '2026-01-03T10:00:00Z',
      },
      {
        text: 'Deep report',
        actual_mins: 100,
        created_at: '2026-01-05T10:00:00Z',
        completed_at: '2026-01-07T10:00:00Z',
      },
      {
        text: 'Deep report',
        actual_mins: 90,
        created_at: '2026-01-08T10:00:00Z',
        completed_at: '2026-01-08T16:00:00Z',
      },
    ]);
    const model = buildMultiChannelModel({
      userId: 'u1',
      samples,
      updatedAt: '2026-01-10T00:00:00Z',
    });
    expect(model.global.carryHazard).not.toBeNull();
    expect(model.global.carryHazard!).toBeGreaterThan(0.3);
  });

  it('partial outcomes do not count as clean duration', () => {
    const samples = beliefSamplesFromHistory([
      {
        text: 'Site visit',
        actual_mins: 40,
        outcome_kind: 'partial',
        created_at: '2026-01-01T10:00:00Z',
        completed_at: '2026-01-01T11:00:00Z',
      },
    ]);
    const model = buildMultiChannelModel({
      userId: 'u1',
      samples,
      updatedAt: '2026-01-02T00:00:00Z',
    });
    expect(model.global.cleanSampleCount).toBe(0);
    expect(model.global.durationMins).toBeNull();
    expect(model.global.authority).toBe('unknown');
  });
});

