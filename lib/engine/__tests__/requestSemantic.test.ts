import { describe, expect, it } from 'vitest';
import {
  applyUtteranceToRequest,
  interpretRequestUtterance,
  emptyRequest,
} from '../request';
import { emptyWorkingMemory } from '../workingMemory';

const INPUT =
  'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS';

describe('material errand semantic extraction', () => {
  it('extracts the destination without swallowing the purpose phrase', () => {
    const parsed = interpretRequestUtterance(INPUT);

    expect(parsed.action).toBe('pickup');
    expect(parsed.locationText).toBe('Bunnings');
    expect(parsed.objectText).toBe(
      '2 cartridges of clear Sika MS and 2 sausages of Sika White MS'
    );
  });

  it('preserves the complete material request through the engine request', () => {
    const request = applyUtteranceToRequest(
      emptyRequest(),
      INPUT,
      emptyWorkingMemory()
    );

    expect(request.locationText).toBe('Bunnings');
    expect(request.objectText).toBe(
      '2 cartridges of clear Sika MS and 2 sausages of Sika White MS'
    );
    expect(request.rawUtterances).toEqual([INPUT]);
    expect(request.commitment).toBe('hard');
  });

  it('handles spoken movement phrasing with an and-purpose boundary', () => {
    const parsed = interpretRequestUtterance(
      'I need to go to Bunnings and grab 2 cartridges of clear Sika MS'
    );

    expect(parsed.action).toBe('pickup');
    expect(parsed.locationText).toBe('Bunnings');
    expect(parsed.objectText).toBe('2 cartridges of clear Sika MS');
  });

  it('handles spoken movement phrasing with an and-purpose pickup', () => {
    const parsed = interpretRequestUtterance(
      'I need to head to Mitre 10 and get 2 boxes of screws'
    );

    expect(parsed.action).toBe('pickup');
    expect(parsed.locationText).toBe('Mitre 10');
    expect(parsed.objectText).toBe('2 boxes of screws');
  });

  it('does not regress ordinary destination extraction', () => {
    const parsed = interpretRequestUtterance(
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today'
    );

    expect(parsed.locationText).toBe('64 Grace James Road in Pukekohe');
    expect(parsed.objectText).toBe('clips');
    expect(parsed.timeHint).toBe('16:00');
    expect(parsed.dateHint).toBe('today');
  });
});


describe('spoken correction and refinement', () => {
  it('uses the final time when the user corrects themselves in one utterance', () => {
    const parsed = interpretRequestUtterance(
      'drop off clips at 64 Grace James Road at 8am, no wait 9am'
    );

    expect(parsed.timeHint).toBe('09:00');
  });

  it('uses the final date when the user corrects themselves in one utterance', () => {
    const parsed = interpretRequestUtterance(
      'drop off clips at 64 Grace James Road today, no wait tomorrow'
    );

    expect(parsed.dateHint).toBe('tomorrow');
  });

  it('changes an existing quantity without losing the existing request context', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const corrected = applyUtteranceToRequest(
      initial,
      'actually, make that 3',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.action).toBe('pickup');
    expect(corrected.locationText).toBe('Bunnings');
    expect(corrected.objectText).toBe('3 cartridges of clear Sika MS');
    expect(corrected.rawUtterances).toEqual([first, 'actually, make that 3']);
  });

  it('overrides time and date while preserving the active request', () => {
    const first = 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const corrected = applyUtteranceToRequest(
      initial,
      'no, 5pm tomorrow',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.objectText).toBe('clips');
    expect(corrected.locationText).toBe('64 Grace James Road in Pukekohe');
    expect(corrected.timeHint).toBe('17:00');
    expect(corrected.dateHint).toBe('tomorrow');
  });

  it('increments a simple existing quantity for a spoken "more" correction', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const corrected = applyUtteranceToRequest(
      initial,
      'and grab 2 more',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.action).toBe('pickup');
    expect(corrected.locationText).toBe('Bunnings');
    expect(corrected.objectText).toBe('4 cartridges of clear Sika MS');
  });

  it('does not treat an unrelated new pickup as a correction', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const next = applyUtteranceToRequest(
      initial,
      'I need to go to Mitre 10 to get 2 boxes of screws',
      emptyWorkingMemory()
    );

    expect(next.locationText).toBe('Mitre 10');
    expect(next.objectText).toBe('2 boxes of screws');
    expect(next.rawUtterances).toEqual([
      'I need to go to Mitre 10 to get 2 boxes of screws',
    ]);
  });
});


describe('explicit imperative capture boundaries', () => {
  it('treats a bare call as a new task even when a prior request is active', () => {
    const previous = applyUtteranceToRequest(
      emptyRequest(),
      'I need to call Gerald at 10am today',
      emptyWorkingMemory()
    );

    const next = applyUtteranceToRequest(
      previous,
      'call John about the Smith Street flashing',
      { ...emptyWorkingMemory(), activeRequestId: previous.id }
    );

    expect(next.action).toBe('create_task');
    expect(next.objectText).toBe('John about the Smith Street flashing');
    expect(next.rawUtterances).toEqual([
      'call John about the Smith Street flashing',
    ]);
  });

  it('treats a bare check as a new task instead of a list continuation', () => {
    const previous = applyUtteranceToRequest(
      emptyRequest(),
      'I need to call Gerald',
      emptyWorkingMemory()
    );

    const next = applyUtteranceToRequest(
      previous,
      'check flashings for Smith Street',
      { ...emptyWorkingMemory(), activeRequestId: previous.id }
    );

    expect(next.action).toBe('create_task');
    expect(next.objectText).toBe('flashings for Smith Street');
  });
});


describe('spoken object and location corrections', () => {
  it('replaces the active object when the correction supplies a new object', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const corrected = applyUtteranceToRequest(
      initial,
      'actually, make it 2 sausages of Sika White MS',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.action).toBe('pickup');
    expect(corrected.locationText).toBe('Bunnings');
    expect(corrected.objectText).toBe('2 sausages of Sika White MS');
  });

  it('replaces the active location for an explicit correction', () => {
    const first = 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const corrected = applyUtteranceToRequest(
      initial,
      'no, Mitre 10',
      { ...emptyWorkingMemory(), activeRequestId: initial.id }
    );

    expect(corrected.locationText).toBe('Mitre 10');
    expect(corrected.objectText).toBe('2 cartridges of clear Sika MS');
  });

  it('keeps a plain new capture independent from correction context', () => {
    const first = 'I need to call John tomorrow';
    const initial = applyUtteranceToRequest(
      emptyRequest(),
      first,
      emptyWorkingMemory()
    );

    const next = applyUtteranceToRequest(
      initial,
      'I need to call Sarah Friday',
      emptyWorkingMemory()
    );

    expect(next.objectText).toBe('call Sarah');
    expect(next.dateHint).toBe('friday');
    expect(next.rawUtterances).toEqual(['I need to call Sarah Friday']);
  });
});
