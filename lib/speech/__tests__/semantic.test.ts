import { describe, expect, it } from 'vitest';
import { interpretSpeech } from '../interpret';
import { composeSemanticUtterance, canProposeTask } from '../semantic';
import { MUST_NOT_CREATE_TASK } from '../golden/mustNotCreateTask';
import { isActionNegated } from '../semantic/polarity';

describe('semantic — negation safety (critical)', () => {
  it('does not treat "Don\'t call John" as create task', () => {
    const i = interpretSpeech("Don't call John tomorrow.");
    expect(i.mustNotCreateTask).toBe(true);
    expect(i.requiresConfirmation).toBe(true);
    expect(i.intent).not.toBe('create');
  });

  it('detects action negation', () => {
    expect(isActionNegated("Don't call John")).toBe(true);
    expect(isActionNegated('Call John tomorrow')).toBe(false);
  });

  it('I said no to the job is not a task', () => {
    const i = interpretSpeech('I said no to the Henderson job yesterday.');
    expect(i.mustNotCreateTask).toBe(true);
  });
});

describe('semantic — must-not-create-task golden', () => {
  it('blocks false tasks on golden set', () => {
    const failures: string[] = [];
    for (const input of MUST_NOT_CREATE_TASK) {
      const i = interpretSpeech(input);
      const sem = composeSemanticUtterance(input);
      if (!i.mustNotCreateTask && canProposeTask(sem)) {
        failures.push(input);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});

describe('semantic — multi-act', () => {
  it('splits call and email into multiple acts', () => {
    const u = composeSemanticUtterance(
      'Call John tomorrow and email Sarah Friday.'
    );
    const actions = u.acts.filter((a) => a.kind === 'action');
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(u.requiresConfirmation).toBe(true);
  });
});

describe('semantic — reported speech', () => {
  it('does not treat John said as user create', () => {
    const i = interpretSpeech('John said he will send the quote Friday.');
    expect(i.mustNotCreateTask).toBe(true);
  });
});

describe('semantic — questions', () => {
  it('Do I need to call John is not a task', () => {
    const i = interpretSpeech('Do I need to call John tomorrow?');
    expect(i.mustNotCreateTask).toBe(true);
    expect(i.intent).toBe('ask');
  });
});
