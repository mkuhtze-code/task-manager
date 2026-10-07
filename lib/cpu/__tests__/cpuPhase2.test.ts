import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '../index';

describe('Dokkit CPU Phase 2 — evidence and beliefs', () => {
  const base = {
    userId: 'phase2-test',
    context: {
      interface: 'capture',
      surface: 'today',
      todayDate: '2026-10-08',
      jobs: [],
      meetings: [],
    },
    dryRun: true,
  };

  it('turns an explicit request into evidence-backed beliefs', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text' as const,
        text: 'I need to drop off clips to 64 Grace James Road at 4pm today',
      },
    });

    expect(result.context.beliefs.version).toBe(1);
    expect(result.context.beliefs.beliefs.some(
      (b) => b.key.endsWith('.objectText') && b.value.includes('clips')
    )).toBe(true);
    expect(result.context.beliefs.beliefs.some(
      (b) => b.key.endsWith('.locationText') && b.value.includes('Grace James Road')
    )).toBe(true);
    expect(result.context.beliefs.beliefs.some(
      (b) => b.key.endsWith('.timeHint') && b.value === '16:00'
    )).toBe(true);
  });

  it('gives explicit evidence high strength', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text' as const,
        text: 'I need to call the client tomorrow',
      },
    });

    const dateBelief = result.context.beliefs.beliefs.find(
      (b) => b.key.endsWith('.dateHint')
    );

    expect(dateBelief?.strength).toBeGreaterThanOrEqual(4);
    expect(dateBelief?.confidence).toBe('high');
    expect(dateBelief?.supportingEvidence.length).toBeGreaterThan(0);
  });

  it('keeps beliefs separate from transcript memory', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text' as const,
        text: 'Check the flashing when you get a chance',
      },
    });

    expect(result.context.memory.working.recentUtterances.length).toBeGreaterThan(0);
    expect(result.context.beliefs.beliefs.every((b) => !b.key.startsWith('utterance.'))).toBe(true);
  });
});
