import { describe, expect, it } from 'vitest';
import { applyUtteranceToRequest, emptyRequest, interpretRequestUtterance, requestTaskText } from '../request';
import { emptyWorkingMemory } from '../workingMemory';

describe('Phase 15 — capture contract repair', () => {
  it('keeps a communication action primary when its purpose contains “get measurements”', () => {
    const raw = 'I need to call Jordan to get the measurements for the downpipes for Angela Place';
    const parsed = interpretRequestUtterance(raw);
    const request = applyUtteranceToRequest(emptyRequest(), raw, emptyWorkingMemory());

    expect(parsed.action).toBe('create_task');
    expect(parsed.primaryVerb).toBe('call');
    expect(parsed.locationText).toBe('Angela Place');
    expect(requestTaskText(request).toLowerCase()).toContain('call jordan');
    expect(requestTaskText(request).toLowerCase()).toContain('measurements');
    expect(request.action).not.toBe('pickup');
  });

  it('extracts a trailing job street from a check task without carrying the article', () => {
    const parsed = interpretRequestUtterance('check the flashings for Smith Street');
    const request = applyUtteranceToRequest(emptyRequest(), 'check the flashings for Smith Street', emptyWorkingMemory());

    expect(parsed.locationText).toBe('Smith Street');
    expect(parsed.objectText).toBe('flashings for Smith Street');
    expect(requestTaskText(request).toLowerCase()).toContain('check flashings');
  });

  it('replaces the full material object when a correction begins with a quantity', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(emptyRequest(), first, emptyWorkingMemory());
    const corrected = applyUtteranceToRequest(
      initial,
      'actually, make it 2 sausages of Sika White MS',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.action).toBe('pickup');
    expect(corrected.locationText).toBe('Bunnings');
    expect(corrected.objectText).toBe('2 sausages of Sika White MS');
    expect(corrected.rawUtterances).toEqual([first, 'actually, make it 2 sausages of Sika White MS']);
  });

  it('keeps quantity-only corrections distinct from full object replacement', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(emptyRequest(), first, emptyWorkingMemory());
    const corrected = applyUtteranceToRequest(
      initial,
      'actually, make that 3',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.objectText).toBe('3 cartridges of clear Sika MS');
  });

  it('keeps a new capture separate from the previously active request', () => {
    const first = applyUtteranceToRequest(emptyRequest(), 'I need to call John tomorrow', emptyWorkingMemory());
    const next = applyUtteranceToRequest(first, 'I need to call Sarah Friday', emptyWorkingMemory());

    expect(next.dateHint).toBe('friday');
    expect(next.rawUtterances).toEqual(['I need to call Sarah Friday']);
    expect(requestTaskText(next).toLowerCase()).toContain('call sarah');
  });
});
