import { describe, expect, it } from 'vitest';
import { interpretSpeech } from '../interpret';
import { decideSpeechActions, decisionWouldCreateTask } from '../decision';
import { MUST_NOT_CREATE_TASK } from '../golden/mustNotCreateTask';
import { extractTemporals } from '../normalise';

describe('decision — layered confidence', () => {
  it('separates interpretation from action permission', () => {
    const i = interpretSpeech("Don't call John tomorrow.");
    const d = decideSpeechActions(i, { transcriptionConfidence: 'high' });
    expect(d.transcriptionConfidence).toBe('high');
    expect(d.mustNotCreateTask).toBe(true);
    expect(d.primaryAction).not.toBe('create_task');
    expect(decisionWouldCreateTask(d)).toBe(false);
  });

  it('preserves evidence trail', () => {
    const i = interpretSpeech('Call John tomorrow.');
    const d = decideSpeechActions(i);
    expect(d.evidenceTrail.length).toBeGreaterThan(0);
    expect(d.rawText).toContain('Call John');
  });
});

describe('decision — MUST_NOT_CREATE_TASK actual action outcome', () => {
  it('never auto-creates a task on golden set', () => {
    const failures: string[] = [];
    for (const input of MUST_NOT_CREATE_TASK) {
      const i = interpretSpeech(input);
      const d = decideSpeechActions(i);
      if (decisionWouldCreateTask(d)) failures.push(input);
      if (d.primaryAction === 'create_task' && !d.requiresConfirmation) {
        failures.push(`unconfirmed:${input}`);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});

describe('temporal expansions', () => {
  it('resolves by Friday as deadline', () => {
    const refs = extractTemporals('Call John by Friday', '2026-10-01');
    expect(refs.some((r) => r.kind === 'deadline')).toBe(true);
  });

  it('resolves Friday week', () => {
    const refs = extractTemporals('Finish Friday week', '2026-10-01');
    expect(refs.some((r) => r.raw === 'friday week')).toBe(true);
  });

  it('resolves after lunch', () => {
    const refs = extractTemporals('Meet after lunch Friday', '2026-10-01');
    expect(refs.some((r) => r.raw === 'after lunch')).toBe(true);
  });
});
