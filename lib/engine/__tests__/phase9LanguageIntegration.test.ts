import { describe, expect, it } from 'vitest';
import { interpretRequestUtterance, requestTaskText } from '@/lib/engine/request';
import { runConversation } from '@/lib/engine/orchestrate';
import { processInteractionCore } from '@/lib/engine/interaction';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';

const jobs = [
  { id: 'job-angela', name: 'Angela Place', locationText: '12 Angela Place' },
  { id: 'job-grace', name: 'Grace James Road', locationText: '64 Grace James Road, Pukekohe' },
];

const base = {
  userId: null,
  priorRequest: null,
  workingMemory: emptyWorkingMemory(),
  context: {
    todayDate: '2026-10-09',
    openTaskCount: 0,
    remainingMinsToday: 480,
    jobs,
    meetings: [],
  },
};

describe('Phase 9 — language integration', () => {
  it('keeps the primary communication action when a purpose contains another verb', () => {
    const req = interpretRequestUtterance(
      'I need to call Jordan to get the measurements for the downpipes for Angela Place'
    );

    expect(req.primaryVerb).toBe('call');
    expect(req.personText).toBe('Jordan');
    expect(req.purposeText?.toLowerCase()).toContain('get the measurements');
    expect(req.relatedJobText ?? req.locationText).toMatch(/Angela Place/i);
    expect(requestTaskText(req)).toMatch(/Call Jordan/i);
    expect(requestTaskText(req)).not.toMatch(/^Pick up measurements/i);
  });

  it('extracts a store destination without swallowing the purchase action', () => {
    const req = interpretRequestUtterance(
      'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS'
    );

    expect(req.primaryVerb).toBe('go');
    expect(req.locationText).toMatch(/^Bunnings$/i);
    expect(req.objectText?.toLowerCase()).toContain('2 cartridges of clear sika ms');
    expect(req.objectText?.toLowerCase()).toContain('2 sausages of sika white ms');
    expect(req.locationText?.toLowerCase()).not.toContain('to grab');
    expect(req.locationText?.toLowerCase()).not.toContain('sika');
  });

  it('keeps a full drop-off address and explicit city as location context', () => {
    const req = interpretRequestUtterance(
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 12pm today'
    );

    expect(req.primaryVerb).toBe('drop off');
    expect(req.locationText).toMatch(/64 Grace James Road/i);
    expect(req.locationText).toMatch(/Pukekohe/i);
    expect(req.timeHint).toBe('12:00');
    expect(req.dateHint).toBe('today');
    expect(req.objectText?.toLowerCase()).toContain('clips');
  });

  it('turns an explicit scheduled capture into an executable interaction', () => {
    const result = processInteractionCore({
      ...base,
      input: { type: 'text', text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 12pm today' },
    });

    expect(result.outcome).toBe('ACT');
    expect(result.action?.kind).toBe('create_task');
    expect(result.action?.text.toLowerCase()).toContain('drop off');
    expect(result.action?.locationText).toMatch(/64 Grace James Road/i);
    expect(result.action?.surfaceDate).toBe('2026-10-09');
  });

  it('allows a simple explicit commitment to dock without a clarification gate', () => {
    const result = processInteractionCore({
      ...base,
      input: { type: 'text', text: 'I need to call Jordan tomorrow' },
    });

    expect(result.outcome).toBe('ACT');
    expect(result.action?.kind).toBe('create_task');
    expect(result.action?.text.toLowerCase()).toContain('call jordan');
  });

  it('preserves a correction as an update to the active request', () => {
    const results = runConversation(
      [
        'I need to drop off clips to 64 Grace James Road at 12pm today',
        'Actually, make that 2pm',
      ],
      base
    );

    expect(results[0].request.timeHint).toBe('12:00');
    expect(results[1].request.timeHint).toBe('14:00');
    expect(results[1].action.kind).toBe('update_task');
  });

  it('resolves a focused pronoun without turning it into a new unrelated request', () => {
    const results = runConversation(
      [
        'I need to call Jordan tomorrow',
        'Actually, make that Friday',
      ],
      base
    );

    expect(results[1].request.dateHint).toBe('friday');
    expect(results[1].action.kind).toBe('update_task');
  });

  it('does not auto-act on a genuinely ambiguous reference', () => {
    const result = processInteractionCore({
      ...base,
      workingMemory: emptyWorkingMemory(),
      context: {
        ...base.context,
        jobs: [
          { id: 'a', name: 'Smith Road', locationText: '1 Smith Road' },
          { id: 'b', name: 'Smith Road', locationText: '2 Smith Road' },
        ],
      },
      input: { type: 'text', text: 'Update that job' },
    });

    expect(result.outcome).toBe('CLARIFY');
    expect(result.message).toMatch(/Which one did you mean/i);
  });
});
