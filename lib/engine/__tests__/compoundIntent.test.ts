import { describe, expect, it } from 'vitest';
import {
  applyUtteranceToRequest,
  emptyRequest,
  requestTaskText,
} from '../request';
import { emptyWorkingMemory } from '../workingMemory';

describe('compound natural-language task capture', () => {
  it('preserves an explicit CALL action when GET is only the purpose', () => {
    const request = applyUtteranceToRequest(
      null,
      'I need to call Jordan to get the measurements for the downpipes for Angela Place.',
      emptyWorkingMemory(),
    );

    expect(request.action).toBe('create_task');
    expect(request.objectText).toContain('Jordan');
    expect(request.objectText?.toLowerCase()).toContain('get the measurements');
    expect(request.locationText).toBe('Angela Place');

    const text = requestTaskText(request);
    expect(text.toLowerCase()).toContain('call jordan');
    expect(text.toLowerCase()).not.toMatch(/^pick up\b/);
  });

  it('does not turn a top-level information GET into PICK UP', () => {
    const request = applyUtteranceToRequest(
      null,
      'I need to get the measurements for the downpipes for Angela Place.',
      emptyWorkingMemory(),
    );

    expect(request.action).toBe('create_task');
    expect(request.locationText).toBe('Angela Place');

    const text = requestTaskText(request);
    expect(text.toLowerCase()).toMatch(/^get\b/);
    expect(text.toLowerCase()).not.toMatch(/^pick up\b/);
  });

  it('still renders genuine physical pickup as PICK UP', () => {
    const request = applyUtteranceToRequest(
      null,
      'I need to pick up the measurements from Jordan at Angela Place.',
      emptyWorkingMemory(),
    );

    expect(request.action).toBe('pickup');

    const text = requestTaskText(request);
    expect(text.toLowerCase()).toMatch(/^pick up\b/);
  });
});
