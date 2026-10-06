import { describe, expect, it } from 'vitest';
import { processCpuInteraction, executeCpuDecision } from '@/lib/cpu';

const input = {
  userId: 'phase7-real',
  input: { type: 'text' as const, text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today' },
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

describe('Phase 7 real execution contract', () => {
  it('executes the exact CPU-selected task action, not a re-interpretation', async () => {
    const cpu = processCpuInteraction(input);
    const calls: unknown[] = [];
    const result = await executeCpuDecision(cpu, {
      tasks: {
        createTask: async action => {
          calls.push(action);
          return 'created-by-cpu';
        },
        updateTask: async () => undefined,
      },
    });

    expect(result.executed).toBe(true);
    expect(result.execution?.entityId).toBe('created-by-cpu');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      kind: 'create_task',
      locationText: expect.stringContaining('Grace James Road'),
      surfaceDate: '2026-10-07',
    });
  });

  it('never executes an advisory outcome', async () => {
    const cpu = processCpuInteraction({
      ...input,
      input: { ...input.input, text: 'maybe drop off clips sometime' },
    });
    let called = false;
    const result = await executeCpuDecision(cpu, {
      tasks: {
        createTask: async () => {
          called = true;
          return 'bad';
        },
        updateTask: async () => undefined,
      },
    });
    expect(result.executed).toBe(false);
    expect(called).toBe(false);
  });
});
