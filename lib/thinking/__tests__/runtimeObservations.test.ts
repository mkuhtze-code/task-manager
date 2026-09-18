import { describe, it, expect } from 'vitest';
import {
  buildRuntimeObservations,
  lookupTaskSignals,
} from '@/lib/thinking/runtimeObservations';
import type { HistoricalTask } from '@/lib/taskIntelligence';

function hist(partial: Partial<HistoricalTask> & { text: string }): HistoricalTask {
  return {
    text: partial.text,
    actual_mins: partial.actual_mins ?? 30,
    location_text: partial.location_text ?? null,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    job_id: partial.job_id ?? null,
    created_at: partial.created_at ?? '2026-03-01T09:00:00.000Z',
    completed_at: partial.completed_at ?? '2026-03-01T10:00:00.000Z',
  };
}

describe('runtimeObservations', () => {
  it('shares one cluster match for duration and behaviour', () => {
    const history: HistoricalTask[] = [];
    for (let i = 0; i < 5; i++) {
      history.push(
        hist({
          text: 'Update website',
          actual_mins: 40 + i,
          created_at: `2026-03-0${i + 1}T09:00:00.000Z`,
          completed_at: `2026-03-0${i + 2}T09:00:00.000Z`,
        })
      );
    }

    const runtime = buildRuntimeObservations(history);
    const signals = lookupTaskSignals('Update website homepage', runtime);

    expect(signals.estimate).not.toBeNull();
    expect(signals.estimate!.suggestedMins).toBeGreaterThan(0);
    expect(signals.sameDayRate).not.toBeNull();
    expect(signals.sameDayRate!).toBeLessThan(0.4);
    expect(signals.explainBehaviour).toMatch(/moves forward|carried/i);
    expect(signals.explainDuration).toMatch(/≈/);
  });

  it('returns empty signals for blank text', () => {
    const runtime = buildRuntimeObservations([]);
    const signals = lookupTaskSignals('   ', runtime);
    expect(signals.estimate).toBeNull();
    expect(signals.matchedLabel).toBeNull();
  });
});
