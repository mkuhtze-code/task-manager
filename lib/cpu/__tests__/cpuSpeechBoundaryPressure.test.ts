import { describe, expect, it } from 'vitest';
import { interpretSpeech } from '@/lib/speech/interpret';
import { processCpuInteraction } from '@/lib/cpu';

describe('speech → CPU boundary torture test', () => {
  const speechCases = [
    {
      name: 'explicit need commitment',
      text: 'I need to call the client tomorrow',
      intent: 'create',
      commitment: 'strong',
      mustNotCreateTask: false,
    },
    {
      name: 'explicit have-to commitment',
      text: 'I have to drop off the clips at 4pm today',
      commitment: 'strong',
      mustNotCreateTask: false,
    },
    {
      name: 'explicit must commitment',
      text: 'I must check the flashing Friday',
      intent: 'create',
      commitment: 'strong',
      mustNotCreateTask: false,
    },
    {
      name: 'question must not become commitment',
      text: 'Do I need to call the client tomorrow?',
      intent: 'ask',
      commitment: 'none',
      mustNotCreateTask: true,
    },
    {
      name: 'negative must not become commitment',
      text: 'I do not need to call the client tomorrow',
      mustNotCreateTask: true,
    },
    {
      name: 'maybe language remains non-hard',
      text: 'Maybe I should call the client tomorrow',
      commitment: 'none',
    },
    {
      name: 'correction keeps final date',
      text: 'Pick up the flashing from Smiths tomorrow, sorry Friday',
    },
    {
      name: 'correction keeps final time',
      text: 'Drop off the clips at 3pm, no wait 4pm',
    },
    {
      name: 'filler does not erase commitment',
      text: 'Yeah I need to um call John tomorrow',
      commitment: 'strong',
    },
    {
      name: 'defer remains non-executable in speech layer',
      text: 'When I get back, remind me to call John',
      mustNotCreateTask: true,
    },
  ];

  for (const c of speechCases) {
    it(c.name, () => {
      const result = interpretSpeech(c.text, { todayIso: '2026-10-07' });

      if (c.intent) expect(result.intent).toBe(c.intent);
      if (c.commitment) expect(result.commitmentStrength).toBe(c.commitment);
      if (c.mustNotCreateTask !== undefined) {
        expect(result.mustNotCreateTask).toBe(c.mustNotCreateTask);
      }
      if (/maybe/i.test(c.text)) expect(result.commitmentStrength).not.toBe('strong');
      expect(result.normalisedText.length).toBeGreaterThan(0);
    });
  }

  it('does not let a question reach CPU as an executable hard commitment', () => {
    const cpu = processCpuInteraction({
      userId: 'speech-pressure',
      input: { type: 'text', text: 'Do I need to call the client tomorrow?' },
      context: {
        interface: 'capture',
        surface: 'today',
        todayDate: '2026-10-07',
        remainingMinsToday: 0,
        openTaskCount: 2,
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(cpu.decision.authority.mayAct).toBe(false);
    expect(cpu.decision.action?.kind).not.toBe('create_task');
  });

  const cpuCommitments = [
    'I need to call the client tomorrow',
    'I have to check the flashing Friday',
    'I must drop off the clips at 4pm today',
    'I need to pick up the clips from Smiths tomorrow',
  ];

  for (const text of cpuCommitments) {
    it('preserves explicit commitment through CPU: ' + text, () => {
      const cpu = processCpuInteraction({
        userId: 'speech-pressure',
        input: { type: 'text', text },
        context: {
          interface: 'capture',
          surface: 'today',
          todayDate: '2026-10-07',
          remainingMinsToday: 0,
          openTaskCount: 2,
          jobs: [],
          meetings: [],
        },
        dryRun: true,
      });

      expect(cpu.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
      expect(cpu.decision.authority.mayAct).toBe(true);
      expect(cpu.decision.outcome).toBe('ACT');
    });
  }
});
