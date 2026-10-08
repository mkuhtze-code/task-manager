import { describe, expect, it } from 'vitest';
import {
  meetingDensityInWindow,
  minsToNextCommitment,
  orderSequenceItems,
  planCapacitySequence,
  sequenceItemFromProfile,
} from '../sequence';

const item = (
  id: string,
  capacityMins: number,
  urgency: 'anchor' | 'flexible' | 'neutral',
  protectFromCarry = false,
  fit: any = null,
  orderIndex = 0,
) =>
  sequenceItemFromProfile({
    id,
    capacityMins,
    urgency,
    protectFromCarry,
    fit,
    orderIndex,
  });

function at(hour: number, minute = 0): Date {
  return new Date(2026, 9, 8, hour, minute, 0, 0);
}

describe('Phase 8 — capacity sequencing acceptance', () => {
  it('protects an explicit anchor before flexible work', () => {
    const ordered = orderSequenceItems([
      item('flex', 60, 'flexible', false, { fit: 'carry_safe' }, 2),
      item('anchor', 30, 'anchor', true, { fit: 'protect' }, 1),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(['anchor', 'flex']);
  });

  it('keeps the incoming capture inside capacity before carrying old flexible work', () => {
    const plan = planCapacitySequence({
      items: [
        item('old-flex', 45, 'flexible', false, { fit: 'carry_safe' }, 0),
        item('protected', 30, 'neutral', true, { fit: 'possible' }, 1),
      ],
      remainingWindowMins: 60,
      incomingCostMins: 30,
      protectIds: ['protected'],
    });
    expect(plan.carryIds).toContain('old-flex');
    expect(plan.carryIds).not.toContain('protected');
    expect(plan.totalLoadMins).toBe(105);
  });

  it('does not auto-carry protected work even when the day is over capacity', () => {
    const plan = planCapacitySequence({
      items: [
        item('must-do', 90, 'anchor', true, { fit: 'protect' }, 0),
        item('flex', 60, 'flexible', false, { fit: 'carry_safe' }, 1),
      ],
      remainingWindowMins: 100,
    });
    expect(plan.carryIds).toEqual(['flex']);
    expect(plan.carryIds).not.toContain('must-do');
  });

  it('does not claim a full day fits when capacity is exceeded', () => {
    const plan = planCapacitySequence({
      items: [item('a', 50, 'neutral', true), item('b', 50, 'neutral', true)],
      remainingWindowMins: 60,
    });
    expect(plan.totalLoadMins).toBe(100);
    expect(plan.fitsIds).toHaveLength(1);
    expect(plan.carryIds).toEqual([]);
    expect(plan.reasons).toContain('day over capacity; nothing safe to auto-carry');
  });

  it('uses smaller peer blocks first so usable capacity is not needlessly stranded', () => {
    const ordered = orderSequenceItems([
      item('large', 50, 'neutral', true, null, 0),
      item('small', 20, 'neutral', true, null, 1),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(['small', 'large']);
    const plan = planCapacitySequence({
      items: [item('large', 50, 'neutral', true, null, 0), item('small', 20, 'neutral', true, null, 1)],
      remainingWindowMins: 60,
    });
    expect(plan.fitsIds).toEqual(['small']);
  });

  it('calculates the next commitment from now and ignores in-progress commitments', () => {
    expect(
      minsToNextCommitment(at(10), [
        { start: at(9), end: at(11) },
        { start: at(13, 30), end: at(14, 30) },
      ])
    ).toBe(210);
  });

  it('merges overlapping commitments before calculating blocked density', () => {
    const density = meetingDensityInWindow(at(9), 17 * 60, [
      { start: at(10), end: at(11) },
      { start: at(10, 30), end: at(12) },
    ]);
    expect(density).toBeCloseTo(2 / 8, 3);
  });

  it('is deterministic and does not mutate the caller item array', () => {
    const input = [
      item('b', 30, 'flexible', false, { fit: 'carry_safe' }, 1),
      item('a', 20, 'anchor', true, { fit: 'protect' }, 0),
    ];
    const before = input.map((x) => x.id);
    const first = planCapacitySequence({ items: input, remainingWindowMins: 40 });
    const second = planCapacitySequence({ items: input, remainingWindowMins: 40 });
    expect(input.map((x) => x.id)).toEqual(before);
    expect(second).toEqual(first);
  });
});
