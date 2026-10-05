import { describe, it, expect } from 'vitest';
import { processInteraction } from '../interaction';
import { emptyWorkingMemory, makeMemoryItem, remember, setFocus } from '../workingMemory';
import { detectDeferredIntention } from '../deferredIntention';

const jobs = [
  { id: 'j-henderson', name: 'Henderson', locationText: '12 Henderson Rd' },
  { id: 'j-albany', name: 'Albany', locationText: 'Albany site' },
];

const baseContext = {
  interface: 'capture' as const,
  jobs,
  meetings: [{ id: 'm1', text: '2pm site meeting', startAt: '2026-10-05T14:00:00+13:00' }],
  remainingMinsToday: 180,
  openTaskCount: 2,
  todayDate: '2026-10-05',
  travelMins: 25,
  visitDurationMins: 40,
};

describe('Integration Pass 1 — ACT', () => {
  it('adds split September invoice to this job (focus)', () => {
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

    expect(r.outcome).toBe('ACT');
    expect(r.action?.kind).toBe('create_task');
    if (r.action?.kind === 'create_task') {
      expect(r.action.text.toLowerCase()).toMatch(/split|september|invoice/);
      expect(r.action.jobId).toBe('j-henderson');
    }
    expect(r.authority.mayAct).toBe(true);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.facts.join(' ').toLowerCase()).toMatch(/henderson|job=/);
  });

  it('does not guess when two jobs and no focus — CLARIFY', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: { type: 'text', text: 'Add split September invoice to this job' },
      context: {
        ...baseContext,
        currentFocus: null,
      },
    });

    expect(r.outcome).toBe('CLARIFY');
    expect(r.clarify?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(r.action).toBeNull();
  });
});

describe('Integration Pass 1 — ANSWER (feasibility)', () => {
  it('answers time-to-see-job without mutation', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Hey Dokkit, have I got time to go see this job this afternoon?',
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

    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
    expect(r.answer).not.toBeNull();
    expect(r.answer!.evidence.length).toBeGreaterThan(0);
    expect(r.answer!.text.length).toBeGreaterThan(20);
    // With 180 remaining and ~90 needed, should fit
    expect(r.answer!.fits).toBe(true);
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

    // May ACT or CLARIFY depending on object parse; must not invent a second job
    expect(['ACT', 'CLARIFY', 'NO_OP']).toContain(r.outcome);
    if (r.outcome === 'ACT' && r.action?.kind === 'create_task') {
      expect(r.action.jobId).toBe('j-henderson');
    }
  });
});
