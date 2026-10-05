import { describe, it, expect } from 'vitest';
import { processInteraction } from '../interaction';
import { emptyWorkingMemory, makeMemoryItem, remember, setFocus } from '../workingMemory';
import { detectDeferredIntention } from '../deferredIntention';

const baseContext = {
  interface: 'capture' as const,
  jobs: [
    { id: 'j-henderson', name: 'Henderson', locationText: '14 Belgium Road' },
    { id: 'j-albany', name: 'Albany', locationText: null },
  ],
  meetings: [] as Array<{ id: string; text: string; startAt?: string | null }>,
  remainingMinsToday: 180 as number | null,
  openTaskCount: 3,
  todayDate: '2026-10-05',
};

describe('Integration Pass 1 — ACT', () => {
  it('adds split September invoice to this job', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Hey Dokkit, can you add split September invoice to this job?',
      },
      context: {
        ...baseContext,
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(['ACT', 'CLARIFY']).toContain(r.outcome);
    if (r.outcome === 'ACT') {
      expect(r.action).not.toBeNull();
      if (r.action?.kind === 'create_task') {
        expect(r.action.jobId).toBe('j-henderson');
        expect(r.action.text.toLowerCase()).toMatch(/invoice|september/);
      }
    }
  });
});

describe('Integration Pass 1 — ANSWER', () => {
  it('answers feasibility without mutation when capacity allows', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Have I got time to go see this job this afternoon?',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 180,
        travelMins: 25,
        visitDurationMins: 45,
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
    expect(r.answer).not.toBeNull();
    expect(r.answer!.evidence.length).toBeGreaterThan(0);
    expect(r.answer!.text.length).toBeGreaterThan(20);
    // V3 decideTaskFit evidence when capacity is known
    expect(r.answer!.evidence.some((e) => e.startsWith('v3_fit='))).toBe(true);
    expect(r.answer!.decisionTrace).toBeTruthy();
  });

  it('says no when capacity is insufficient', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Have I got time to go see this job this afternoon?',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 40,
        travelMins: 30,
        visitDurationMins: 60,
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.answer!.fits).toBe(false);
    expect(r.action).toBeNull();
  });
});

describe('Integration Pass 1 — DEFER', () => {
  it('stores contextual intention, does not create ordinary task', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Hey Dokkit, remind me when I get back to the office to send Mike the invoice.',
      },
      context: baseContext,
    });

    expect(r.outcome).toBe('DEFER');
    expect(r.deferred).not.toBeNull();
    expect(r.deferred!.executionReady).toBe(false);
    expect(r.deferred!.trigger.type).toMatch(/LOCATION|RETURN_TO_ACTIVITY/);
    expect(r.deferred!.trigger.label.toLowerCase()).toMatch(/office/);
    expect(r.deferred!.actionText.toLowerCase()).toMatch(/mike|invoice/);
    expect(r.action?.kind).toBe('noop');
    expect(r.facts).toContain('execution_not_claimed');
  });

  it('detectDeferredIntention is pure and stable', () => {
    const d = detectDeferredIntention(
      'Remind me when I get back to the office to send Mike the invoice.',
      { userId: 'u1' }
    );
    expect(d).not.toBeNull();
    expect(d!.executionReady).toBe(false);
  });
});

describe('Integration Pass 1 — reference / correction', () => {
  it('resolves "that" via working memory focus into ACT path context', () => {
    let mem = emptyWorkingMemory();
    mem = remember(
      mem,
      makeMemoryItem({
        type: 'task',
        label: 'Split September invoice',
        source: 'test',
        salience: 0.95,
        id: 't-inv',
      })
    );
    mem = setFocus(mem, {
      kind: 'task',
      id: 't-inv',
      label: 'Split September invoice',
    });

    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      workingMemory: mem,
      input: { type: 'text', text: 'Add that to this job' },
      context: {
        ...baseContext,
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(['ACT', 'CLARIFY', 'NO_OP']).toContain(r.outcome);
    if (r.outcome === 'ACT' && r.action?.kind === 'create_task') {
      expect(r.action.jobId).toBe('j-henderson');
    }
  });
});

describe('Integration Pass 1 — adversarial / fail-safe', () => {
  it('does not create a task for pure feasibility questions', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: { type: 'text', text: 'Can I fit Henderson this afternoon?' },
      context: {
        ...baseContext,
        remainingMinsToday: 180,
        travelMins: 25,
        visitDurationMins: 45,
        currentFocus: { kind: 'job', id: 'j-henderson', label: 'Henderson' },
      },
    });
    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
  });

  it('defers when-I-get-back without claiming notification', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Remind me when I get back to the office to call the client.',
      },
      context: baseContext,
    });
    expect(r.outcome).toBe('DEFER');
    expect(r.deferred!.executionReady).toBe(false);
    expect(r.facts).toContain('execution_not_claimed');
  });

  it('missing capacity stays honest (no over-claim)', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Have I got time to go see this job this afternoon?',
      },
      context: {
        ...baseContext,
        remainingMinsToday: null,
        currentFocus: { kind: 'job', id: 'j-henderson', label: 'Henderson' },
      },
    });
    expect(r.outcome).toBe('ANSWER');
    expect(r.answer!.fits).toBeNull();
    expect(r.answer!.confidence).toBe('low');
  });

  it('should-I is query not mutation', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: { type: 'text', text: 'Should I go see this job later?' },
      context: {
        ...baseContext,
        remainingMinsToday: 90,
        currentFocus: { kind: 'job', id: 'j-henderson', label: 'Henderson' },
      },
    });
    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
  });
});
