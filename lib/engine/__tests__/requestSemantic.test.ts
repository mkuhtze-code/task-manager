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

  it('handles spoken movement phrasing with a for-purpose boundary', () => {
    const parsed = interpretRequestUtterance(
      'I need to head to Mitre 10 for 2 boxes of screws'
    );

    expect(parsed.action).toBe('create_task');
    expect(parsed.locationText).toBe('Mitre 10');
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
