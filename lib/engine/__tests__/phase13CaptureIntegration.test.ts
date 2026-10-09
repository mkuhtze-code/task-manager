import { describe, expect, it } from 'vitest';
import { interpretSemanticInput } from '../semanticInterpreter';
import { runEngineCycle } from '../orchestrate';
import { emptyWorkingMemory } from '../workingMemory';

const memory = () => emptyWorkingMemory('today');

describe('Phase 13 — end-to-end semantic capture', () => {
  it('exposes communication roles on the semantic interpretation itself', () => {
    const result = interpretSemanticInput(
      'I need to call Jordan to get the measurements for the downpipes for Angela Place.',
      { workingMemory: memory() }
    );
    expect(result.primaryVerb).toBe('call');
    expect(result.personText).toBe('Jordan');
    expect(result.purposeText).toMatch(/get the measurements/i);
    expect(result.subjectText).toBe('measurements for the downpipes');
    expect(result.locationText).toBe('Angela Place');
  });

  it('exposes a movement destination and coordinated products on the semantic interpretation', () => {
    const result = interpretSemanticInput(
      'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.',
      { workingMemory: memory() }
    );
    expect(result.primaryVerb).toBe('go');
    expect(result.locationText).toBe('Bunnings');
    expect(result.grammar.items).toEqual([
      { quantity: 2, text: 'cartridges of clear Sika MS' },
      { quantity: 2, text: 'sausages of Sika White MS' },
    ]);
  });

  it('exposes delivery destination without time/date contamination', () => {
    const result = interpretSemanticInput(
      'I need to drop off clips to 64 Grace James Road in Pukekohoe at 4pm today',
      { workingMemory: memory() }
    );
    expect(result.objectText).toBe('clips');
    expect(result.locationText).toBe('64 Grace James Road in Pukekohoe');
    expect(result.timeHint).toBe('16:00');
    expect(result.dateHint).toBe('today');
  });

  it('preserves an executable communication task through orchestration', () => {
    const result = runEngineCycle({
      utterance: 'I need to call Jordan to get the measurements for the downpipes for Angela Place.',
      workingMemory: memory(),
    });
    expect(result.action.kind).toBe('create_task');
    expect(result.request.personText).toBe('Jordan');
    expect(result.request.objectText).toBe('measurements for the downpipes');
    expect(result.request.locationText).toBe('Angela Place');
    expect(result.authority.mayAct).toBe(true);
  });

  it('preserves both quantities and the supplier stop through orchestration', () => {
    const result = runEngineCycle({
      utterance: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.',
      workingMemory: memory(),
    });
    expect(result.action.kind).toBe('create_task');
    expect(result.request.locationText).toBe('Bunnings');
    expect(result.request.objectText).toContain('2 cartridges of clear Sika MS');
    expect(result.request.objectText).toContain('2 sausages of Sika White MS');
    expect(result.authority.mayAct).toBe(true);
  });

  it('keeps delivery dockable when capacity is low and preserves the explicit time', () => {
    const result = runEngineCycle({
      utterance: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      todayDate: '2026-10-09',
      workingMemory: memory(),
      context: { remainingMinsToday: 5, openTaskCount: 12, jobs: [], meetings: [] },
    });
    expect(result.request.objectText).toBe('clips');
    expect(result.request.locationText?.toLowerCase()).toContain('64 grace james road');
    expect(result.request.timeHint).toBe('16:00');
    expect(result.request.dateHint).toBe('today');
    expect(result.authority.mayAct).toBe(true);
    expect(result.action.kind).toBe('create_task');
  });

  it('does not invent a person for a temporal check about the flashings', () => {
    const result = interpretSemanticInput(
      'I need to check on Monday whether the flashings can be fixed',
      { workingMemory: memory() }
    );
    expect(result.primaryVerb).toBe('check');
    expect(result.personText).toBeNull();
    expect(result.grammar.relations).toEqual([]);
  });

  it('does not turn a thin vague utterance into an executable task', () => {
    const result = runEngineCycle({
      utterance: 'maybe something later',
      workingMemory: memory(),
    });
    expect(result.authority.mayAct).toBe(false);
    expect(result.action.kind).not.toBe('create_task');
  });
  it('preserves a named recipient for an ordinary check request', () => {
    const result = interpretSemanticInput(
      'I need to check Jordan about whether the flashings can be fixed',
      { workingMemory: memory() }
    );
    expect(result.primaryVerb).toBe('check');
    expect(result.personText).toBe('Jordan');
  });

});
