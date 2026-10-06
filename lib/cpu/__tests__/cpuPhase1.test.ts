import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '../index';

describe('Dokkit CPU Phase 1', () => {
  it('preserves the existing explicit-schedule action path', () => {
    const result = processCpuInteraction({
      userId: 'cpu-test',
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
      context: {
        interface: 'capture',
        surface: 'today',
        todayDate: '2026-10-07',
        remainingMinsToday: 10,
        openTaskCount: 3,
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.action?.surfaceDate).toBe('2026-10-07');
    expect(result.decision.action?.locationText).toContain('Grace James Road');
    expect(result.decision.observations.some((o) => o.brain === 'thinking')).toBe(true);
    expect(result.context.interface).toBe('capture');
  });

  it('does not invent cross-surface relationships yet', () => {
    const result = processCpuInteraction({
      userId: 'cpu-test',
      input: {
        type: 'text',
        text: 'Check flight tickets',
      },
      context: {
        interface: 'today',
        surface: 'today',
        todayDate: '2026-10-07',
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.outcome).toBeDefined();
    expect(result.decision.relationships).toEqual([]);
  });

  it('supports speech, Android and future Auto clients through the same façade', () => {
    const base = {
      userId: 'cpu-test',
      input: {
        type: 'speech_transcript' as const,
        text: 'Call John tomorrow',
        confidence: 'high' as const,
      },
      context: {
        interface: 'voice',
        todayDate: '2026-10-07',
        jobs: [],
        meetings: [],
      },
      dryRun: true,
    };

    const voice = processCpuInteraction(base);
    const auto = processCpuInteraction({
      ...base,
      context: { ...base.context, interface: 'android_auto' },
      cpu: { interface: 'android_auto' },
    });

    expect(voice.decision.outcome).toBe(auto.decision.outcome);
    expect(voice.decision.request.action).toBe(auto.decision.request.action);
    expect(auto.context.interface).toBe('android_auto');
  });
});
