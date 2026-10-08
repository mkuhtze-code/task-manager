import { describe, expect, it } from 'vitest';
import { buildPersonalModel, lookupHierarchicalDuration } from '../model';
import { decideTaskFit } from '../fit';

const updatedAt = '2026-10-08T00:00:00.000Z';

describe('Dokkit Phase 7 — personal task fit', () => {
  it('starts honestly with an onboarding duration rather than claiming personal knowledge', () => {
    const model = buildPersonalModel({ userId: 'p7', samples: [], updatedAt });
    const d = lookupHierarchicalDuration('Site measure access', model);

    expect(d.level).toBe('onboarding');
    expect(d.authority).toBe('observe');
    expect(d.confidence.overall).toBe('low');
    expect(d.distribution.expectedMins).toBe(30);
  });

  it('uses a matching personal cluster when repeated evidence exists', () => {
    const model = buildPersonalModel({
      userId: 'p7',
      updatedAt,
      samples: [
        { text: 'Site measure access', actualMins: 40 },
        { text: 'Site measure entry', actualMins: 45 },
        { text: 'Site measure inspection', actualMins: 42 },
      ],
    });
    const d = lookupHierarchicalDuration('Site measure review', model);

    expect(d.level).toBe('cluster');
    expect(d.clusterId).not.toBeNull();
    expect(d.distribution.sampleSize).toBeGreaterThanOrEqual(2);
    expect(d.authority).toBe('suggest');
  });

  it('does not let sparse evidence become falsely authoritative', () => {
    const model = buildPersonalModel({
      userId: 'p7',
      updatedAt,
      samples: [
        { text: 'Unique site task', actualMins: 90 },
        { text: 'Email client', actualMins: 20 },
        { text: 'Invoice client', actualMins: 25 },
      ],
    });
    const d = lookupHierarchicalDuration('Unique site task', model);

    expect(d.level).toBe('cluster');
    expect(d.authority).toBe('observe');
    expect(d.distribution.expectedMins).toBeLessThan(90);
    expect(d.reasons.some((r) => r.includes('shrunk'))).toBe(true);
  });

  it('protects active work regardless of fit', () => {
    const d = decideTaskFit({
      capacityMins: 90,
      remainingWindowMins: 30,
      sameDayRate: 0.1,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: false,
      isActive: true,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });

    expect(d.fit).toBe('protect');
    expect(d.protectFromCarry).toBe(true);
    expect(d.confidence).toBe('high');
  });

  it('protects explicit timing instead of treating it as an optional fit', () => {
    const d = decideTaskFit({
      capacityMins: 120,
      remainingWindowMins: 20,
      sameDayRate: 0,
      protectFromCarry: false,
      dueToday: false,
      hasIntendedTime: true,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });

    expect(d.fit).toBe('protect');
    expect(d.protectFromCarry).toBe(true);
  });

  it('blocks work that would overrun a fixed commitment when there is no carry evidence', () => {
    const d = decideTaskFit({
      capacityMins: 60,
      remainingWindowMins: 120,
      minsToNextCommitment: 30,
      meetingDensity: 0.5,
      sameDayRate: 0.8,
      protectFromCarry: true,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: null,
    });

    expect(d.fit).toBe('blocked');
    expect(d.reasons.some((r) => r.includes('overrun'))).toBe(true);
  });

  it('allows carry-safe work when the user repeatedly carries that class', () => {
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
        clusterId: 'site',
        label: 'site measure',
        sampleCount: 5,
        sameDayRate: 0.25,
        carryRate: 0.75,
        durationDispersionMins: 10,
        consistency: 0.7,
        estimationLogBias: 0.1,
        highVariance: false,
      },
      duration: null,
    });

    expect(d.fit).toBe('carry_safe');
    expect(d.protectFromCarry).toBe(false);
  });

  it('marks wide or weak duration evidence as uncertain rather than overconfident', () => {
    const d = decideTaskFit({
      capacityMins: 80,
      remainingWindowMins: 100,
      sameDayRate: 0.5,
      protectFromCarry: true,
      dueToday: false,
      hasIntendedTime: false,
      isActive: false,
      behaviour: null,
      clusterBehaviour: null,
      duration: {
        expectedMins: 80,
        interval: { low: 20, high: 140 },
        sampleSize: 1,
        method: 'blended',
        level: 'cluster',
        clusterId: 'c1',
        clusterLabel: 'site work',
        authority: 'observe',
        confidence: {
          overall: 'low',
          sampleStrength: 'low',
          effectStrength: 'low',
          consistencyStrength: 'low',
          recencyWeight: null,
          specificity: 0.3,
          contradiction: 'none',
          staleness: 'current',
        },
        reasons: [],
      },
    });

    expect(d.fit).toBe('uncertain');
    expect(d.confidence).toBe('low');
  });
});
