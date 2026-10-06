import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '../index';

describe('Dokkit CPU Phase 3 — reconciliation', () => {
  it('keeps an explicit user commitment actionable even when capacity is tight', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
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

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.authority.mayAct).toBe(true);
    expect(result.decision.recommendedAction?.kind).toBe('create_task');
  });

  it('surfaces a contextual job relationship without changing the primary action', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
      input: {
        type: 'text',
        text: 'Ask Smith about the flashing',
      },
      context: {
        interface: 'today',
        surface: 'today',
        todayDate: '2026-10-07',
        jobs: [{ id: 'job-smith', name: 'Smith house', locationText: null }],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.outcome).toBeDefined();
    expect(result.decision.opportunities.some((o) => o.kind === 'job')).toBe(true);
    expect(result.decision.opportunities.find((o) => o.kind === 'job')?.entityIds).toContain('job-smith');
  });

  it('does not invent opportunities when the relevant context is unavailable', () => {
    const result = processCpuInteraction({
      userId: 'phase3-test',
      input: {
        type: 'text',
        text: 'Check flight tickets',
      },
      context: {
        interface: 'today',
        surface: 'today',
        todayDate: '2026-10-07',
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.opportunities).toEqual([]);
    expect(result.decision.conflicts).toEqual([]);
  });
});
