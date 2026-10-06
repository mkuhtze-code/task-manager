import { describe, expect, it } from 'vitest';
import { executeCpuDecision, processCpuInteraction } from '../index';

const input = {
  userId: 'phase7-test',
  input: {
    type: 'text' as const,
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
};

describe('Dokkit CPU Phase 7 universal execution', () => {
  it('executes the CPU-selected action through a registered task executor', async () => {
    const cpu = processCpuInteraction(input);
    const calls: string[] = [];

    const result = await executeCpuDecision(cpu, {
      tasks: {
        createTask: async (action) => {
          calls.push(action.text);
          expect(action.locationText).toContain('Grace James Road');
          expect(action.surfaceDate).toBe('2026-10-07');
          return 'task-created-1';
        },
      },
    });

    expect(result.executed).toBe(true);
    expect(result.execution?.status).toBe('executed');
    expect(result.execution?.entityId).toBe('task-created-1');
    expect(calls).toEqual([expect.stringContaining('drop off clips')]);
  });

  it('does not execute when authority says no', async () => {
    const cpu = processCpuInteraction({
      ...input,
      input: { ...input.input, text: 'maybe drop off clips sometime' },
    });
    let called = false;

    const result = await executeCpuDecision(cpu, {
      tasks: {
        createTask: async () => {
          called = true;
          return 'should-not-happen';
        },
      },
    });

    expect(result.executed).toBe(false);
    expect(result.execution).toBeNull();
    expect(called).toBe(false);
  });

  it('reports missing executor instead of pretending execution happened', async () => {
    const cpu = processCpuInteraction(input);
    const result = await executeCpuDecision(cpu, {});

    expect(result.executed).toBe(false);
    expect(result.execution?.status).toBe('unsupported');
    expect(result.execution?.message).toMatch(/executor/i);
  });

  it('contains execution failures without claiming success', async () => {
    const cpu = processCpuInteraction(input);
    const result = await executeCpuDecision(cpu, {
      tasks: {
        createTask: async () => {
          throw new Error('database unavailable');
        },
      },
    });

    expect(result.executed).toBe(false);
    expect(result.execution?.status).toBe('failed');
    expect(result.execution?.error).toBeInstanceOf(Error);
  });

  it('preserves the hard commitment invariant through execution', async () => {
    const cpu = processCpuInteraction(input);
    expect(cpu.decision.authority.mayAct).toBe(true);
    expect(cpu.decision.recommendedAction?.kind).toBe('create_task');

    const result = await executeCpuDecision(cpu, {
      tasks: { createTask: async () => 'committed-task' },
    });

    expect(result.executed).toBe(true);
    expect(result.execution?.entityId).toBe('committed-task');
  });
});
