/**
 * Discourse supersession + past-tense observation regressions (V5 resolve pass).
 */

import { describe, expect, it } from 'vitest';
import { processCaptureSpeech } from '../captureAdapter';
import { composeSemanticUtterance } from '../semantic/compose';
import { normaliseSpeech } from '../normalise';

function acts(text: string) {
  const n = normaliseSpeech(text);
  return composeSemanticUtterance(text, n);
}

describe('discourse — entity replacement', () => {
  it('Call Tim. Actually, call Tom. → only Tom survives as create candidate', () => {
    const u = acts('Call Tim. Actually, call Tom.');
    const createable = u.acts.filter(
      (a) => a.kind === 'action' && a.polarity !== 'negated' && !a.blocksTaskCreation
    );
    expect(createable.length).toBe(1);
    expect(createable[0].objectText?.toLowerCase()).toMatch(/tom/);
    const blocked = u.acts.filter((a) => a.blocksTaskCreation && /tim/i.test(a.rawSpan));
    expect(blocked.length).toBeGreaterThanOrEqual(1);
  });

  it('processCaptureSpeech does not dual-create Tim+Tom', () => {
    const r = processCaptureSpeech({ text: 'Call Tim. Actually, call Tom.' });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    const summaries = r.proposals.map((p) => p.summary.toLowerCase()).join(' ');
    if (r.proposals.length > 1) {
      const open = r.proposals.filter((p) => !p.blocked);
      expect(open.length).toBeLessThanOrEqual(1);
    }
    expect(summaries).toMatch(/tom/);
  });
});

describe('discourse — temporal revision', () => {
  it('Call Tim tomorrow. Actually Friday. → Friday attached, not dual create', () => {
    const u = acts('Call Tim tomorrow. Actually Friday.');
    const createable = u.acts.filter((a) => a.kind === 'action' && !a.blocksTaskCreation);
    expect(createable.length).toBeLessThanOrEqual(1);
    if (createable[0]) {
      const t = `${createable[0].temporalRaw ?? ''} ${createable[0].rawSpan}`.toLowerCase();
      expect(
        t.includes('friday') ||
          createable[0].evidence.some((e) => e.signal === 'temporal_revised')
      ).toBe(true);
    }
  });
});

describe('discourse — tell her attachment', () => {
  it('Email Sarah and tell her we are running late → single primary act preferred', () => {
    const r = processCaptureSpeech({
      text: 'Email Sarah and tell her we are running late.',
    });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(['CREATE_TASK', 'ASK_CLARIFICATION', 'CREATE_MULTIPLE_TASKS']).toContain(r.outcome);
  });

  it('Call John about the job. Tell him I will be there Friday.', () => {
    const r = processCaptureSpeech({
      text: "Call John about the job. Tell him I'll be there Friday.",
    });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(r.outcome).not.toBe('DO_NOT_CREATE');
  });
});

describe('discourse — past tense observation', () => {
  it('I called Tim. is not a create', () => {
    const r = processCaptureSpeech({ text: 'I called Tim.' });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(['DO_NOT_CREATE', 'RECORD_OBSERVATION', 'NOTE_REPORTED', 'ASK_CLARIFICATION']).toContain(
      r.outcome
    );
  });
});

describe('discourse — mixed negation still works', () => {
  it('positive sibling survives', () => {
    const r = processCaptureSpeech({
      text: "I don't need to call Tim, but I do need to email Sarah.",
    });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(r.mustNotCreateTask).toBe(false);
    expect(r.proposals.some((p) => /email|sarah/i.test(p.summary))).toBe(true);
  });
});

describe('discourse — wait no call', () => {
  it('wait wait no call Tom does not create', () => {
    const r = processCaptureSpeech({ text: 'wait wait no call Tom' });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
    expect(r.outcome).not.toBe('CREATE_TASK');
  });
});
