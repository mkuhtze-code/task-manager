import { describe, it, expect } from 'vitest';
import { decideTaskFit } from '../fit';
import { structuralFeaturesFromTask } from '../coldStart';

describe('UX-4 cold-start fit honesty', () => {
  it('does not return strong fit when duration evidence is cold', () => {
    const structural = structuralFeaturesFromTask({
      text: 'Write the weekly status update for stakeholders',
      estimate_mins: 45,
      job_id: 'job-1',
    });
    const decision = decideTaskFit({
      capacityMins: 20, // thin prior
      remainingWindowMins: 120,
      sameDayRate: null,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: {
        level: 'system',
        expectedMins: 30,
        distribution: {
          expectedMins: 30,
          interval: { low: 15, high: 60 },
          sampleSize: 0,
          method: 'prior',
        },
        authority: 'observe',
        confidence: { overall: 'low', sampleSize: 0 },
      } as any,
      structural,
    });
    expect(decision.fit).not.toBe('strong');
    expect(
      decision.reasons.some(
        (r) =>
          r.includes('cold-start') ||
          r.includes('structure until personal') ||
          r.includes('using structure')
      ) || decision.fit === 'possible' || decision.fit === 'unknown' || decision.fit === 'uncertain'
    ).toBe(true);
  });

  it('protect still wins for active tasks even when cold', () => {
    const decision = decideTaskFit({
      capacityMins: 30,
      remainingWindowMins: 120,
      sameDayRate: null,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: true,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
      structural: structuralFeaturesFromTask({ text: 'x' }),
    });
    expect(decision.fit).toBe('protect');
  });
});

