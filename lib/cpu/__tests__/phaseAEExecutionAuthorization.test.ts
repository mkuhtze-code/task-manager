import { describe, expect, it } from 'vitest';
import { executeCpuDecision, processCpuInteraction } from '@/lib/cpu';
import type { CpuCycleResult } from '@/lib/cpu';

const BASE = {
  userId: 'phase-ae-authorization-test',
  context: {
    interface: 'capture',
    surface: 'today',
    todayDate: '2026-10-12',
    remainingMinsToday: 240,
    openTaskCount: 0,
    jobs: [],
    meetings: [],
  },
  dryRun: true,
} as const;

function run(text: string): CpuCycleResult {
  return processCpuInteraction({
    ...BASE,
    input: { type: 'text', text },
  });
}

function executors(calls: unknown[]) {
  return {
    tasks: {
      createTask: async (action: unknown) => {
        calls.push({ type: 'create', action });
        return 'created-test-task';
      },
      updateTask: async (action: unknown) => {
        calls.push({ type: 'update', action });
        return undefined;
      },
    },
  };
}

describe('Phase AE — execution authorization boundary', () => {
  it.each([
    ['information question', 'Why does the same melody sound different in another key?'],
    ['observation', 'The thingamajig is making a high-pitched noise again.'],
    ['tentative hypothesis', 'Maybe the timeout is caused by the proxy, but we have not confirmed that.'],
    ['completed report', 'I already sent the invoice to Chris yesterday.'],
    ['negated action', 'Do not send the invoice to Chris today.'],
    ['hypothetical', 'If I were to send the invoice to Chris, would Friday be too late?'],
  ])('never dispatches a mutation for a %s', async (_label, text) => {
    const cycle = run(text);
    const calls: unknown[] = [];

    const result = await executeCpuDecision(cycle, executors(calls));

    expect(result.executed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('does not dispatch when the authority gate denies an otherwise actionable decision', async () => {
    const cycle = run('I need to call the client tomorrow');
    const calls: unknown[] = [];
    const denied = {
      ...cycle,
      decision: {
        ...cycle.decision,
        authority: {
          ...cycle.decision.authority,
          mayAct: false,
        },
      },
    } as CpuCycleResult;

    const result = await executeCpuDecision(denied, executors(calls));

    expect(result.executed).toBe(false);
    expect(result.execution).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('dispatches one selected action for an explicit commitment, without reinterpreting it', async () => {
    const cycle = run('I need to call the client tomorrow');
    const calls: unknown[] = [];

    const result = await executeCpuDecision(cycle, executors(calls));

    if (cycle.decision.outcome === 'ACT' && cycle.decision.authority.mayAct) {
      expect(result.executed).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        type: 'create',
        action: cycle.decision.recommendedAction,
      });
    } else {
      // This test must not silently count a blocked positive control as a pass.
      expect(cycle.decision.outcome).toBe('ACT');
      expect(cycle.decision.authority.mayAct).toBe(true);
      expect(result.executed).toBe(true);
    }
  });
});
