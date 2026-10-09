import { describe, expect, it } from 'vitest';
import { containsReference, extractReferencePhrase } from '../references';
import { processInteractionCore } from '../interaction';
import { emptyWorkingMemory } from '../workingMemory';

describe('Phase 17 — capture reference gates', () => {
  it.each([
    'I need to go to Bunnings this morning to grab materials',
    'I need to finish this week',
    'There is a meeting at 10am',
    'It is Monday and I need to call Jordan',
  ])('does not classify ordinary temporal/existential wording as a reference: %s', (text) => {
    expect(containsReference(text)).toBe(false);
  });

  it.each([
    ['Update that job', 'that job'],
    ['Move it to tomorrow', 'it'],
    ['I am heading there after the meeting', 'there'],
    ['Add this to the job', 'the job'],
  ])('still recognises an intentional reference in: %s', (text, phrase) => {
    expect(containsReference(text)).toBe(true);
    expect(extractReferencePhrase(text)).toBe(phrase);
  });

  it('lets a complete new capture reach task interpretation when jobs exist and the user says “this morning”', () => {
    const result = processInteractionCore({
      userId: null,
      priorRequest: null,
      workingMemory: emptyWorkingMemory(),
      context: {
        todayDate: '2026-10-09',
        openTaskCount: 0,
        remainingMinsToday: 240,
        jobs: [
          { id: 'job-a', name: 'Angela Place', locationText: '12 Angela Place' },
          { id: 'job-b', name: 'Grace James Road', locationText: '64 Grace James Road' },
        ],
        meetings: [{ id: 'meeting-a', text: 'Site meeting at 10am' }],
      },
      input: {
        type: 'text',
        text: 'I need to go to Bunnings this morning to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS',
      },
      dryRun: true,
    });

    expect(result.outcome).not.toBe('CLARIFY');
    expect(result.message).not.toMatch(/Which one did you mean/i);
    expect(result.action?.kind).toBe('create_task');
    expect(result.action?.text.toLowerCase()).toContain('sika');
  });
});
