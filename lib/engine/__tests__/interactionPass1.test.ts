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
  it('treats a speech-style feasibility question without punctuation as a query', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: { type: 'speech_transcript', text: 'have I got time to get to Henderson this afternoon' },
      context: baseContext,
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.answer).not.toBeNull();
  });

  it('does not turn an explicit scheduled stop into a capacity veto', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: { type: 'speech_transcript', text: 'drop the clips at Grace James Road at 4 today' },
      context: { ...baseContext, remainingMinsToday: 5 },
    });

    expect(r.outcome).toBe('ACT');
    expect(r.authority.mayAct).toBe(true);
    expect(r.action?.kind).toBe('create_task');
  });


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


describe('Integration Pass 1 — capture interpretation boundaries', () => {
  it('keeps a destination clean when movement is followed by a purpose phrase', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS',
      },
      context: baseContext,
    });

    expect(r.outcome).toBe('ACT');
    expect(r.action?.kind).toBe('create_task');
    expect(r.action?.locationText).toBe('Bunnings');
    expect(r.action?.text).toMatch(/2 cartridges of clear Sika MS/i);
    expect(r.action?.text).toMatch(/2 sausages of Sika White MS/i);
    expect(r.action?.locationText).not.toMatch(/to grab/i);
  });

  it('preserves explicit tomorrow scheduling without capacity veto', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'speech_transcript',
        text: 'I need to drop off the clips to Grace James Road at 9am tomorrow',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 1,
      },
    });

    expect(r.outcome).toBe('ACT');
    expect(r.authority.mayAct).toBe(true);
    expect(r.request.dateHint).toBe('tomorrow');
    expect(r.request.timeHint).toBe('09:00');
    expect(r.action?.kind).toBe('create_task');
  });
});



describe('Phase P — capture capacity and trace consistency', () => {
  it('uses task estimate rather than visit-plus-travel for ordinary captured work', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Add split September invoice to this job',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 180,
        travelMins: 30,
        visitDurationMins: 60,
        currentFocus: {
          kind: 'job',
          id: 'j-henderson',
          label: 'Henderson',
        },
      },
    });

    expect(r.outcome).toBe('ACT');
    expect(r.action?.kind).toBe('create_task');
    expect(r.decision).not.toBeNull();
    if (r.action?.kind === 'create_task') {
      expect(r.decision?.effectiveCapacityMins).toBe(r.action.estimateMins);
      expect(r.decision?.effectiveCapacityMins).toBeLessThan(60);
    }
  });

  it('uses actual engine evidence IDs and carries context time into the trace', () => {
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
    expect(r.decision).not.toBeNull();
    expect(r.decisionTrace).not.toBeNull();
    const evidenceIds = new Set(r.evidence.map((e) => e.id));
    expect(r.decision!.evidenceIds.every((id) => evidenceIds.has(id))).toBe(true);
    expect(r.decision!.evidenceIds.every((id) => !id.startsWith('ans-'))).toBe(true);
    expect(r.decisionTrace!.evidenceIds).toEqual(r.decision!.evidenceIds);
    expect(r.decisionTrace!.inputs.contextAt).toBeTruthy();
    expect(Date.parse(r.decisionTrace!.inputs.contextAt!)).not.toBeNaN();
  });
});

describe('Integration Pass 1 — shared fit authority', () => {
  it('uses the same V3 fit decision for ACT and ANSWER', async () => {
    const { runEngineCycle } = await import('../orchestrate');
    const { answerFeasibility, actFitDecision } = await import('../interactionAnswer');

    const input = {
      userId: 'u1',
      dryRun: true,
      input: { type: 'text' as const, text: 'Go see Henderson' },
      context: {
        ...baseContext,
        remainingMinsToday: 55,
        travelMins: 25,
        visitDurationMins: 45,
        currentFocus: { kind: 'job' as const, id: 'j-henderson', label: 'Henderson' },
      },
    };

    const cycle = runEngineCycle({
      utterance: input.input.text,
      todayDate: input.context.todayDate,
      context: {
        jobs: input.context.jobs,
        meetings: input.context.meetings,
        remainingMinsToday: input.context.remainingMinsToday,
        openTaskCount: input.context.openTaskCount,
      },
    });

    const answer = answerFeasibility(input.input.text, cycle, input);
    const act = actFitDecision(cycle, input);

    expect(act.fitState).toBe(answer.fitState);
    expect(act.decision?.fit).toBe(answer.decision?.fit);
    expect(act.decision?.effectiveCapacityMins).toBe(answer.decision?.effectiveCapacityMins);
    expect(act.decisionTrace).not.toBeNull();
    expect(answer.decisionTrace).not.toBeNull();
  });
});


describe('Phase AA — shared task-versus-visit capacity sizing', () => {
  it('answers ordinary task questions with the same task-sized estimate used by ACT', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Do I have time to review the contract?',
      },
      context: {
        ...baseContext,
        remainingMinsToday: 40,
        travelMins: 30,
        visitDurationMins: 60,
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.action).toBeNull();
    expect(r.decision).not.toBeNull();
    expect(r.decision!.effectiveCapacityMins).toBe(15);
    expect(r.answer!.fits).toBe(true);
    expect(r.answer!.text).toContain('this task needs about 15 minutes');
    expect(r.answer!.text).not.toContain('visit plus travel');
  });

  it('keeps explicit movement questions on the visit-plus-travel budget', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Do I have time to go see Henderson this afternoon?',
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
    expect(r.decision).not.toBeNull();
    expect(r.decision!.effectiveCapacityMins).toBe(95);
    expect(r.answer!.fits).toBe(true);
    expect(r.answer!.text).toContain('visit');
    expect(r.answer!.text).toContain('travel');
  });
});
