import { describe, it, expect } from 'vitest';
import {
  minsToNextCommitment,
  meetingDensityInWindow,
  orderSequenceItems,
  planCapacitySequence,
  sequenceItemFromProfile,
} from '../sequence';

function at(h: number, m = 0): Date {
  return new Date(2026, 2, 15, h, m, 0, 0);
}

describe('minsToNextCommitment', () => {
  it('returns null with no future starts', () => {
    expect(minsToNextCommitment(at(10), [])).toBeNull();
    expect(
      minsToNextCommitment(at(12), [
        { start: at(9), end: at(10) },
      ])
    ).toBeNull();
  });

  it('skips in-progress and finds next start', () => {
    const mins = minsToNextCommitment(at(10), [
      { start: at(9), end: at(11) },
      { start: at(14), end: at(15) },
    ]);
    expect(mins).toBe(240);
  });
});

describe('meetingDensityInWindow', () => {
  it('returns 0 with no commitments', () => {
    expect(meetingDensityInWindow(at(9), 17 * 60, [])).toBe(0);
  });

  it('reports blocked fraction of remaining window', () => {
    const d = meetingDensityInWindow(at(9), 17 * 60, [
      { start: at(10), end: at(11) },
    ]);
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(0.125, 2);
  });
});

describe('planCapacitySequence', () => {
  it('orders protect/anchor before flexible and carries flexible when over', () => {
    const items = [
      sequenceItemFromProfile({
        id: 'flex-big',
        capacityMins: 90,
        urgency: 'flexible',
        protectFromCarry: false,
        fit: { fit: 'carry_safe', confidence: 'medium', protectFromCarry: false, reasons: [], effectiveCapacityMins: 90 },
        orderIndex: 2,
      }),
      sequenceItemFromProfile({
        id: 'anchor',
        capacityMins: 30,
        urgency: 'anchor',
        protectFromCarry: true,
        fit: { fit: 'protect', confidence: 'high', protectFromCarry: true, reasons: [], effectiveCapacityMins: 30 },
        orderIndex: 1,
      }),
      sequenceItemFromProfile({
        id: 'small',
        capacityMins: 20,
        urgency: 'neutral',
        protectFromCarry: true,
        fit: { fit: 'possible', confidence: 'medium', protectFromCarry: true, reasons: [], effectiveCapacityMins: 20 },
        orderIndex: 0,
      }),
    ];
    const ordered = orderSequenceItems(items);
    expect(ordered[0].id).toBe('anchor');
    expect(ordered[ordered.length - 1].id).toBe('flex-big');

    const plan = planCapacitySequence({
      items,
      remainingWindowMins: 60,
      incomingCostMins: 0,
    });
    expect(plan.carryIds).toContain('flex-big');
    expect(plan.carryIds).not.toContain('anchor');
  });

  it('returns empty carry when everything fits', () => {
    const plan = planCapacitySequence({
      items: [
        sequenceItemFromProfile({
          id: 'a',
          capacityMins: 20,
          urgency: 'neutral',
          protectFromCarry: true,
          orderIndex: 0,
        }),
      ],
      remainingWindowMins: 120,
    });
    expect(plan.carryIds).toEqual([]);
    expect(plan.fitsIds).toContain('a');
  });
});
