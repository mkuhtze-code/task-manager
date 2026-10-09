import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processCpuInteraction, resolveContextReference } from '@/lib/cpu';
import type { CpuInput } from '@/lib/cpu/types';
import { emptyWorkingMemory, makeMemoryItem, setFocus } from '@/lib/engine/workingMemory';

type ReplayCase = {
  id: string;
  priorTurns: Array<{ text: string }>;
  memory: {
    focus?: { kind: 'task' | 'job' | 'list' | 'meeting' | 'request' | 'none'; id: string; label: string };
    tasks?: Array<{ id: string; label: string; timestamp: string; salience: number }>;
    locations?: Array<{ id: string; label: string; timestamp: string; salience: number }>;
  };
  context?: { jobs?: Array<{ id: string; name: string; locationText?: string | null }> };
  followup: string;
  expected: {
    referenceStatus: 'resolved' | 'ambiguous' | 'unknown';
    targetId?: string | null;
    phrase?: string | null;
    interactionOutcome?: 'ACT' | 'ANSWER' | 'DEFER' | 'CLARIFY' | 'NO_OP';
  };
};

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'data/intelligence-corpus/context-replay-v1.json'), 'utf8'),
) as { version: number; cases: ReplayCase[] };

function replayInput(text: string, replayCase: ReplayCase, workingMemory: ReturnType<typeof emptyWorkingMemory>): CpuInput {
  return {
    userId: null,
    input: { type: 'text', text },
    context: {
      interface: 'capture',
      surface: '2026-10-09',
      todayDate: '2026-10-09',
      jobs: replayCase.context?.jobs ?? [],
      meetings: [],
    },
    workingMemory,
    dryRun: true,
  };
}

function seedMemory(replayCase: ReplayCase) {
  let memory = emptyWorkingMemory('today');
  if (replayCase.memory.focus) {
    memory = setFocus(memory, replayCase.memory.focus);
  }
  memory = {
    ...memory,
    recentTasks: (replayCase.memory.tasks ?? []).map((item) =>
      makeMemoryItem({ ...item, type: 'task', source: 'phase-f-context-replay' }),
    ),
    recentLocations: (replayCase.memory.locations ?? []).map((item) =>
      makeMemoryItem({ ...item, type: 'location', source: 'phase-f-context-replay' }),
    ),
  };
  return memory;
}

describe('Phase F — structured context replay (deterministic, diagnostic)', () => {
  it('loads a versioned fixture set with unique case IDs', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(5);
    expect(new Set(fixture.cases.map((testCase) => testCase.id)).size).toBe(fixture.cases.length);
  });

  for (const replayCase of fixture.cases) {
    it(replayCase.id, () => {
      const memory = seedMemory(replayCase);
      const input = replayInput(replayCase.followup, replayCase, memory);
      const resolution = resolveContextReference(input, null, memory);

      expect(resolution.status).toBe(replayCase.expected.referenceStatus);
      if ('targetId' in replayCase.expected) {
        expect(resolution.target?.id ?? null).toBe(replayCase.expected.targetId ?? null);
      }
      if ('phrase' in replayCase.expected) {
        expect(resolution.phrase).toBe(replayCase.expected.phrase);
      }
      if (replayCase.expected.interactionOutcome) {
        const result = processCpuInteraction(input);
        expect(result.decision.outcome).toBe(replayCase.expected.interactionOutcome);
        expect(result.decision.recommendedAction).toBeNull();
      }
    });
  }

  it('does not let stale focus hijack a complete new explicit capture', () => {
    const memory = setFocus(emptyWorkingMemory('today'), {
      kind: 'task',
      id: 'old-task',
      label: 'Old task about a different subject',
    });
    const testCase: ReplayCase = {
      id: 'explicit-new-capture',
      priorTurns: [{ text: 'Old task about a different subject' }],
      memory: {},
      followup: 'I need to call Jordan about the Smith Street flashing.',
      expected: { referenceStatus: 'unknown' },
    };
    const result = processCpuInteraction(replayInput(testCase.followup, testCase, memory));
    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    if (result.decision.action?.kind === 'create_task') {
      expect(result.decision.action.text.toLowerCase()).toContain('call jordan');
    }
  });
});
