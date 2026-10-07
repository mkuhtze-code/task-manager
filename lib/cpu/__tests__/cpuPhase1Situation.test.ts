import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '../index';

describe('Dokkit CPU Phase 1 — canonical situation', () => {
  it('puts the evaluated request and authority inside the same situation as world context', () => {
    const result = processCpuInteraction({
      userId: 'phase1-test',
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
      context: {
        interface: 'capture',
        surface: 'today',
        todayDate: '2026-10-07',
        remainingMinsToday: 10,
        openTaskCount: 3,
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.context.situation.version).toBe(1);
    expect(result.context.situation.request).toEqual(result.decision.request);
    expect(result.context.situation.authority).toEqual(result.decision.authority);
    expect(result.context.situation.request.action).toBe('create_task');
    expect(result.context.situation.request.locationText).toContain('64 Grace James Road');
    expect(result.context.situation.request.timeHint).toBe('16:00');
    expect(result.context.situation.request.dateHint).toBe('today');
    expect(result.context.situation.authority.mayAct).toBe(true);
    expect(result.context.situation.constraints.remainingMinsToday).toBe(10);
  });

  it('keeps Bunnings destination separate from the pickup object', () => {
    const result = processCpuInteraction({
      userId: 'phase1-test',
      input: {
        type: 'text',
        text: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS',
      },
      context: {
        interface: 'capture',
        surface: 'today',
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.context.situation.request.locationText?.toLowerCase()).toBe('bunnings');
    expect(result.context.situation.request.objectText?.toLowerCase()).toContain('2 cartridges of clear sika ms');
    expect(result.context.situation.request.objectText?.toLowerCase()).not.toContain('bunnings');
  });
});
