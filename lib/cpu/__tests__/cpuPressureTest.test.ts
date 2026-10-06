import { describe, expect, it } from 'vitest';
import { processCpuInteraction, executeCpuDecision } from '@/lib/cpu';

const base = {
  userId: 'cpu-pressure-test',
  context: {
    interface: 'capture',
    surface: 'today',
    todayDate: '2026-10-07',
    remainingMinsToday: 120,
    openTaskCount: 3,
    jobs: [],
    meetings: [],
  },
  dryRun: true,
};

function run(text: string, overrides: Record<string, unknown> = {}) {
  return processCpuInteraction({
    ...base,
    input: { type: 'text', text },
    ...(overrides as object),
  });
}

describe('Dokkit CPU pressure test — Phase 10', () => {
  describe('1. commitment authority invariants', () => {
    const committedInputs = [
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      'I need to call the client tomorrow',
      'I need to collect the flashing at 4pm',
      'I need to pick up the clips today',
      'I need to drop that off at 4 today',
    ];

    for (const text of committedInputs) {
      it(`does not turn an explicit commitment into a refusal: ${text}`, () => {
        const cpu = run(text, {
          context: {
            ...base.context,
            remainingMinsToday: 1,
            jobs: [],
            meetings: [],
          },
        });

        expect(cpu.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
        expect(cpu.decision.authority.mayAct).not.toBe(false);
        if (cpu.decision.authority.commitmentClass === 'HARD_COMMITMENT') {
          expect(cpu.decision.authority.mayAct).toBe(true);
        }
      });
    }

    it('does not let capacity warnings replace an explicit commitment', () => {
      const cpu = run('I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today', {
        context: {
          ...base.context,
          remainingMinsToday: 0,
          jobs: [{ id: 'job-grace', name: 'Grace James', locationText: '64 Grace James Road' }],
        },
      });

      expect(cpu.decision.outcome).toBe('ACT');
      expect(cpu.decision.authority.mayAct).toBe(true);
      expect(cpu.decision.action?.kind).toBe('create_task');
      expect(cpu.decision.explanation).not.toMatch(/today looks tight|consider tomorrow morning/i);
      expect(cpu.decision.action?.surfaceDate).toBe('2026-10-07');
      expect(cpu.decision.action?.locationText).toContain('64 Grace James Road');
    });

    it('does not allow opportunity reasoning to override a hard commitment', () => {
      const cpu = run('I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today', {
        context: {
          ...base.context,
          remainingMinsToday: 0,
          jobs: [
            { id: 'job-grace', name: 'Grace James', locationText: '64 Grace James Road' },
            { id: 'job-other', name: 'Other Job', locationText: '64 Grace James Road' },
          ],
        },
      });

      expect(cpu.decision.authority.mayAct).toBe(true);
      expect(cpu.decision.outcome).toBe('ACT');
      expect(cpu.decision.surfaceOpportunity).toBeNull();
    });
  });

  describe('2. speech-to-CPU boundary', () => {
    const messyInputs = [
      'yeah I need to um drop those clips off at Grace James, no wait 64 Grace James Road, Pukekohe, four today',
      'check the flight tickets — actually not today, sometime this week',
      'pick up the flashing from Smiths tomorrow… sorry Friday',
    ];

    for (const text of messyInputs) {
      it(`produces one coherent CPU decision for messy speech: ${text}`, () => {
        const cpu = run(text);
        expect(cpu.decision).toBeDefined();
        expect(cpu.decision.interaction).toBeDefined();
        expect(cpu.decision.request).toBeDefined();
        expect(cpu.decision.action ?? cpu.decision.outcome).toBeDefined();
        expect(cpu.decision.authority).toBeDefined();
      });
    }

    it('does not silently convert a correction into two executable actions', () => {
      const cpu = run('pick up the flashing from Smiths tomorrow, sorry Friday');
      expect(cpu.decision.action?.kind === 'create_task' || cpu.decision.outcome !== 'ACT').toBe(true);
      if (cpu.decision.action?.kind === 'create_task') {
        expect(cpu.decision.action.surfaceDate).not.toBe('2026-10-08');
      }
    });
  });

  describe('3. cross-world collisions', () => {
    it('finds useful spatial convergence without requiring a schedule mutation', () => {
      const cpu = run('Go to the post office sometime today', {
        context: {
          ...base.context,
          jobs: [
            { id: 'job-collection', name: 'Friday collection', locationText: 'Post Office' },
          ],
        },
      });

      expect(cpu.decision.recommendedAction).toBe(cpu.decision.action);
      expect(cpu.decision.opportunities.length).toBeGreaterThan(0);
      expect(cpu.decision.surfaceOpportunity?.entityIds).toContain('job-collection');
    });

    it('does not invent a connection from unrelated locations', () => {
      const cpu = run('Go to the post office sometime today', {
        context: {
          ...base.context,
          jobs: [{ id: 'job-builder', name: 'Builder job', locationText: '42 Smith Street' }],
        },
      });

      expect(cpu.decision.opportunities.some(o => o.entityIds.includes('job-builder'))).toBe(false);
    });

    it('does not surface weak memory as if it were a strong relationship', () => {
      const cpu = run('Check the thing for the recent Smith job', {
        context: {
          ...base.context,
          jobs: [],
        },
      });

      const memory = cpu.decision.rankedOpportunities.filter(o => o.kind === 'memory');
      for (const opportunity of memory) {
        expect(opportunity.disposition).not.toBe('surface');
      }
    });
  });

  describe('4. action integrity', () => {
    it('executes exactly the CPU-selected action and never re-interprets it', async () => {
      const cpu = run('I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today');
      const calls: unknown[] = [];

      const result = await executeCpuDecision(cpu, {
        tasks: {
          createTask: async action => {
            calls.push(action);
            return 'pressure-created';
          },
          updateTask: async () => undefined,
        },
      });

      expect(result.executed).toBe(true);
      expect(result.execution?.entityId).toBe('pressure-created');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(cpu.decision.recommendedAction);
    });

    it('never executes an advisory/suggestion decision', async () => {
      const cpu = run('Maybe I should go to the post office sometime');
      let called = false;

      const result = await executeCpuDecision(cpu, {
        tasks: {
          createTask: async () => {
            called = true;
            return 'must-not-create';
          },
          updateTask: async () => undefined,
        },
      });

      expect(result.executed).toBe(false);
      expect(called).toBe(false);
    });

    it('does not claim execution when the required executor is absent', async () => {
      const cpu = run('I need to call the client tomorrow');
      const result = await executeCpuDecision(cpu, {});
      expect(result.executed).toBe(false);
      expect(result.execution?.status).not.toBe('executed');
    });
  });

  describe('5. interface consistency', () => {
    it('returns the same underlying decision for text, voice and Android Auto interfaces', () => {
      const text = run('I need to drop off clips at 4pm today');
      const voice = run('I need to drop off clips at 4pm today', {
        input: { type: 'voice', text: 'I need to drop off clips at 4pm today' },
        context: { ...base.context, interface: 'voice' },
      });
      const auto = run('I need to drop off clips at 4pm today', {
        input: { type: 'voice', text: 'I need to drop off clips at 4pm today' },
        context: { ...base.context, interface: 'android_auto' },
      });

      expect(voice.decision.outcome).toBe(text.decision.outcome);
      expect(auto.decision.outcome).toBe(text.decision.outcome);
      expect(voice.decision.action).toEqual(text.decision.action);
      expect(auto.decision.action).toEqual(text.decision.action);
    });
  });

  describe('6. non-regression safety', () => {
    it('does not mutate the caller input object', () => {
      const input = {
        ...base,
        input: { type: 'text' as const, text: 'Go to the post office sometime today' },
      };
      const before = JSON.parse(JSON.stringify(input));
      processCpuInteraction(input);
      expect(input).toEqual(before);
    });

    it('always exposes one authoritative interaction inside the CPU decision', () => {
      const cpu = run('I need to drop off clips at 4pm today');
      expect(cpu.decision.interaction.action).toEqual(cpu.decision.action);
      expect(cpu.decision.recommendedAction).toEqual(cpu.decision.action);
      expect(cpu.decision.authority).toEqual(cpu.decision.interaction.authority);
    });
  });
});
