import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '../index';
import { runCaptureDock } from '@/lib/engine/captureDock';

const base = {
  userId: 'cpu-phase5-test',
  input: {
    type: 'text' as const,
    text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
  },
  context: {
    interface: 'capture',
    surface: 'today',
    todayDate: '2026-10-07',
    remainingMinsToday: 10,
    openTaskCount: 3,
    jobs: [] as Array<{ id: string; name: string; locationText?: string | null }>,
    meetings: [] as Array<{ id: string; text: string; startAt?: string | null; durationMins?: number | null }>,
  },
  dryRun: true,
};

describe('Dokkit CPU Phase 5 routing', () => {
  it('keeps the CPU path authoritative when capacity is tight but the user explicitly commits', () => {
    const result = processCpuInteraction(base);

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.authority.mayAct).toBe(true);
    expect(result.decision.recommendedAction?.kind).toBe('create_task');
  });

  it('routes Capture Dock through the CPU without changing the dock contract', () => {
    const result = runCaptureDock({
      line: base.input.text,
      userId: base.userId,
      priorRequest: null,
      jobs: [],
      captureJobId: null,
      captureSurfaceDate: '2026-10-07',
      remainingMinsToday: 10,
      openTaskCount: 3,
      inputType: 'text',
    });

    expect(result.kind).toBe('act_create');
    if (result.kind === 'act_create') {
      expect(result.overrides.surfaceDate).toBe('2026-10-07');
      expect(result.overrides.locationText).toContain('Grace James Road');
    }
  });



  it.each([
    ['call Jordan to get measurements', 'call', 'Jordan', 'get measurements', 'create_task'],
    ['email Sarah to confirm the quote for Smith Road', 'email', 'Sarah', 'confirm the quote', 'create_task'],
    ['pick up the screws from Bunnings', 'pick up', null, null, 'pickup'],
    ['go to Angela Place to inspect the flashing', 'go', null, null, 'create_task'],
  ])(
    'preserves semantic intent through the universal CPU: %s',
    (text, primaryVerb, personText, purposeText, expectedAction) => {
      const result = processCpuInteraction({
        ...base,
        input: { ...base.input, text },
        context: { ...base.context, remainingMinsToday: 480 },
      });

      expect(result.decision.request.primaryVerb).toBe(primaryVerb);
      if (personText) expect(result.decision.request.personText).toBe(personText);
      if (purposeText) expect(result.decision.request.purposeText).toContain(purposeText);
      expect(result.decision.request.action).toBe(expectedAction);
      expect(result.decision.action?.kind).not.toBe('ask');
    }
  );

  it('does not let CPU reconciliation replace explicit semantic action with a nested verb', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        ...base.input,
        text: 'I need to call Jordan to get the measurements for the downpipes for Angela Place',
      },
      context: { ...base.context, remainingMinsToday: 480 },
    });

    expect(result.decision.request.primaryVerb).toBe('call');
    expect(result.decision.request.personText).toBe('Jordan');
    expect(result.decision.request.action).toBe('create_task');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.action?.text.toLowerCase()).toContain('call jordan');
    expect(result.decision.action?.text.toLowerCase()).not.toMatch(/^pick up\\b/);
  });

  it('preserves the complete semantic frame through reconciliation and action conversion', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        ...base.input,
        text: 'Call Jordan tomorrow at 4pm to confirm the downpipe measurements for Angela Place',
      },
      context: { ...base.context, remainingMinsToday: 480 },
    });

    const request = result.decision.request;

    expect(request.primaryVerb).toBe('call');
    expect(request.personText).toBe('Jordan');
    expect(request.purposeText).toContain('confirm the downpipe measurements');
    expect(request.subjectText).toContain('downpipe measurements');
    expect(request.locationText).toBe('Angela Place');
    expect(request.dateHint).toBe('tomorrow');
    expect(request.timeHint).toBe('4pm');
    expect(request.relatedJobText).toBe('Angela Place');

    expect(result.decision.recommendedAction?.kind).toBe('create_task');
    expect(result.decision.recommendedAction?.kind === 'create_task'
      ? result.decision.recommendedAction.locationText
      : null).toBe('Angela Place');
    expect(result.decision.recommendedAction?.kind === 'create_task'
      ? result.decision.recommendedAction.text.toLowerCase()
      : '').toContain('call jordan');
    expect(result.decision.recommendedAction?.kind === 'create_task'
      ? result.decision.recommendedAction.text.toLowerCase()
      : '').not.toMatch(/^pick up\\b/);
  });

  it('keeps explicit physical procurement distinct from a trailing job relationship', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        ...base.input,
        text: 'Get 6 lengths of gutter from the supplier for Smith Road',
      },
      context: { ...base.context, remainingMinsToday: 480 },
    });

    expect(result.decision.request.primaryVerb).toBe('get');
    expect(result.decision.request.action).toBe('create_task');
    expect(result.decision.request.locationText).toBe('the supplier');
    expect(result.decision.request.relatedJobText).toBe('Smith Road');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.action?.kind === 'create_task'
      ? result.decision.action.locationText
      : null).toBe('the supplier');
    expect(result.decision.action?.kind === 'create_task'
      ? result.decision.action.text.toLowerCase()
      : '').toContain('gutter');
  });

  it('keeps the CPU interface-neutral for voice and Android Auto', () => {
    const voice = processCpuInteraction({
      ...base,
      input: { ...base.input, type: 'speech_transcript' },
      context: { ...base.context, interface: 'voice' },
    });
    const auto = processCpuInteraction({
      ...base,
      input: { ...base.input, type: 'speech_transcript' },
      context: { ...base.context, interface: 'android_auto' },
      cpu: { interface: 'android_auto' },
    });

    expect(auto.decision.outcome).toBe(voice.decision.outcome);
    expect(auto.decision.request.action).toBe(voice.decision.request.action);
    expect(auto.decision.action?.kind).toBe(voice.decision.action?.kind);
  });
});
