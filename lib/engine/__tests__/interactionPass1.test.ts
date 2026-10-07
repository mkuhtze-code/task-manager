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
      // V3 DecisionTrace attached when capacity is known (same path as ANSWER).
      expect(r.decision).not.toBeNull();
      expect(r.decisionTrace).not.toBeNull();
      expect(r.fitState).toBeTruthy();
      expect(r.facts.some((f) => f.startsWith('v3_fit='))).toBe(true);
    }
  });
});



  it('explicit date/time remains actionable even when the day is tight', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 5,
      },
    });

    expect(r.outcome).toBe('ACT');
    expect(r.action?.kind).toBe('create_task');
    expect(r.action?.surfaceDate).toBe('2026-10-05');
    expect(r.action?.locationText).toMatch(/Grace James Road/i);
    expect(r.request.timeHint).toBe('16:00');
    expect(r.request.dateHint).toBe('today');
    expect(r.authority.mayAct).toBe(true);
  });

  it('does not mutate the orchestrated request when add-to-job enrichment is applied', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Add split September invoice to this job',
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

    expect(r.outcome).toBe('ACT');
    expect(r.request.relatedJobText).toBe('Henderson');
    expect(r.request.objectText).toMatch(/invoice/i);
    expect(r.cycle.request).not.toBe(r.request);
    expect(r.cycle.request.relatedJobText).not.toBe('Henderson');
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
    expect(r.answer!.fits).toBe(true);
    expect(r.answer!.evidence.some((e) => e.startsWith('v3_fit='))).toBe(true);
    expect(r.answer!.decision).not.toBeNull();
    expect(r.answer!.decisionTrace).not.toBeNull();
  });

  it('says no when capacity is clearly insufficient', () => {
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
        meetings: [
          {
            id: 'm1',
            text: 'Client call',
            startAt: '2026-10-05T14:00:00.000Z',
          },
        ],
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
    expect(r.answer!.fits).toBe(false);
  });
});

describe('Integration Pass 1 — DEFER', () => {
  it('stores contextual intention for when I get back to the office', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Remind me when I get back to the office to send Mike the invoice.',
      },
      context: baseContext,
    });

    expect(r.outcome).toBe('DEFER');
    expect(r.deferred).not.toBeNull();
    expect(r.deferred!.executionReady).toBe(false);
    expect(r.deferred!.trigger.type).toMatch(/LOCATION|RETURN_TO_ACTIVITY/);
    expect(r.facts).toContain('execution_not_claimed');
    expect(r.action?.kind).toBe('noop');
  });
});

describe('Integration Pass 1 — reference resolution', () => {
  it('resolves this job from focus without inventing a second authority path', () => {
    const mem = emptyWorkingMemory('u1');
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
