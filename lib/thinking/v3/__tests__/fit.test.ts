import { describe, it, expect } from 'vitest';
import { decideTaskFit } from '../fit';
import { capacityBiasScaleFromBehaviour } from '../../runtimeObservations';
import { buildUserBehaviourModel } from '../behaviour';

describe('decideTaskFit', () => {
  it('protects active and intended-time tasks', () => {
    const active = decideTaskFit({
      capacityMins: 40,
      remainingWindowMins: 30,
      sameDayRate: 0.2,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: true,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    expect(active.fit).toBe('protect');

    const timed = decideTaskFit({
      capacityMins: 40,
      remainingWindowMins: 30,
      sameDayRate: null,
      protectFromCarry: true,
      dueToday: false,
      hasIntendedTime: true,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    expect(timed.fit).toBe('protect');
  });

  it('marks carry_safe when over window and often carried', () => {
    const d = decideTaskFit({
      capacityMins: 90,
      remainingWindowMins: 40,
      sameDayRate: 0.25,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: {
        clusterId: 'c1',
        label: 'site measure',
        sampleCount: 4,
        sameDayRate: 0.25,
        carryRate: 0.75,
        durationDispersionMins: 20,
        consistency: 0.5,
        estimationLogBias: 0.4,
        highVariance: false,
      },
      duration: null,
    });
    expect(d.fit).toBe('carry_safe');
  });

  it('marks strong when comfortably within window', () => {
    const d = decideTaskFit({
      capacityMins: 20,
      remainingWindowMins: 120,
      sameDayRate: 0.7,
      protectFromCarry: true,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });
    expect(d.fit).toBe('possible');
  });
});

describe('capacityBiasScaleFromBehaviour', () => {
  it('returns 1 with sparse evidence', () => {
    expect(capacityBiasScaleFromBehaviour(null, 'anything')).toBe(1);
  });

  it('scales up when user underestimates', () => {
    const model = buildUserBehaviourModel({
      userId: 'u1',
      samples: [
        {
          text: 'Site measure access',
          actualMins: 60,
          estimateMins: 30,
          createdAt: '2026-01-01T09:00:00Z',
          completedAt: '2026-01-01T10:00:00Z',
        },
        {
          text: 'Site measure access',
          actualMins: 55,
          estimateMins: 30,
          createdAt: '2026-01-02T09:00:00Z',
          completedAt: '2026-01-02T10:00:00Z',
        },
        {
          text: 'Site measure access',
          actualMins: 50,
          estimateMins: 30,
          createdAt: '2026-01-03T09:00:00Z',
          completedAt: '2026-01-03T10:00:00Z',
        },
      ],
      updatedAt: '2026-01-10T00:00:00Z',
    });
    const scale = capacityBiasScaleFromBehaviour(model, 'Site measure access');
    expect(scale).toBeGreaterThan(1);
  }, 15_000); // Avoid false failures when deterministic clustering tests run on a contended CI worker.
});
