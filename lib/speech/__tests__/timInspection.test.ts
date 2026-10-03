import { describe, it, expect } from 'vitest';
import { processCaptureSpeech } from '../captureAdapter';
import { composeSemanticUtterance } from '../semantic/compose';
import { normaliseSpeech } from '../normalise';

const TIM =
  "Call Tim about the details tomorrow, wait, we need to pass the inspection first. Oh, and I need to pick up the stuff for Mike and drop that off this afternoon. So lets wait and call Tim at the end of the week.";

describe('TIM_INSPECTION_GATE plan graph', () => {
  it('does not mutate without confirm', () => {
    const r = processCaptureSpeech({ text: TIM });
    expect(r.wouldMutateWithoutConfirm).toBe(false);
  });

  it('final surviving plan: Tim at end of week + pick up; no obsolete tomorrow call', () => {
    const n = normaliseSpeech(TIM);
    const u = composeSemanticUtterance(TIM, n);
    const open = u.acts.filter(
      (a) => a.kind === 'action' && a.polarity !== 'negated' && !a.blocksTaskCreation
    );
    const callTim = open.filter(
      (a) => a.actionVerb === 'call' && /tim/i.test(a.objectText ?? a.rawSpan)
    );
    expect(callTim.length).toBe(1);
    expect(
      (callTim[0].temporalRaw ?? '').toLowerCase().includes('end of the week') ||
        callTim[0].evidence.some((e) => e.signal === 'temporal_revised')
    ).toBe(true);
    expect(open.some((a) => /inspection/i.test(a.rawSpan))).toBe(false);
    expect(open.some((a) => a.actionVerb === 'pick' || /pick/i.test(a.rawSpan))).toBe(true);
  });
});
