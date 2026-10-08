import { describe, expect, it } from 'vitest';
import { parseSemanticGrammar } from '../semanticGrammar';
import { runEngineCycle } from '../orchestrate';
import { emptyWorkingMemory } from '../workingMemory';

describe('Phase 12 — semantic grammar', () => {
  it('keeps the primary communication action when a nested purpose verb is present', () => {
    const g = parseSemanticGrammar(
      'I need to call Jordan to get the measurements for the downpipes for Angela Place.'
    );
    expect(g.primaryVerb).toBe('call');
    expect(g.personText).toBe('Jordan');
    expect(g.subjectText).toBe('measurements for the downpipes');
    expect(g.locationText).toBe('Angela Place');
    expect(g.relations).toContain('action→purpose');
  });

  it('keeps a movement destination separate from a nested purchase action', () => {
    const g = parseSemanticGrammar(
      'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.'
    );
    expect(g.primaryVerb).toBe('go');
    expect(g.locationText).toBe('Bunnings');
    expect(g.items).toHaveLength(2);
    expect(g.items[0]).toEqual({ quantity: 2, text: 'cartridges of clear Sika MS' });
    expect(g.items[1]).toEqual({ quantity: 2, text: 'sausages of Sika White MS' });
  });

  it('preserves coordinated objects instead of collapsing them', () => {
    const g = parseSemanticGrammar('grab 3 screws and 4 washers');
    expect(g.items).toEqual([
      { quantity: 3, text: 'screws' },
      { quantity: 4, text: 'washers' },
    ]);
  });

  it('does not split an unquantified product phrase on arbitrary "and"', () => {
    const g = parseSemanticGrammar('grab nuts and bolts');
    expect(g.items).toHaveLength(1);
    expect(g.items[0].text).toBe('nuts and bolts');
  });

  it('does not mistake the infinitive "to" for a destination', () => {
    const g = parseSemanticGrammar('I need to call Jordan tomorrow');
    expect(g.primaryVerb).toBe('call');
    expect(g.personText).toBe('Jordan');
    expect(g.locationText).toBeNull();
  });

  it('wires communication grammar into the executable request path', () => {
    const r = runEngineCycle({
      utterance: 'I need to call Jordan to get the measurements for the downpipes for Angela Place.',
      workingMemory: emptyWorkingMemory(),
    });
    expect(r.request.primaryVerb).toBe('call');
    expect(r.request.personText).toBe('Jordan');
    expect(r.request.objectText).toBe('measurements for the downpipes');
    expect(r.request.locationText).toBe('Angela Place');
    expect(r.action.kind).toBe('create_task');
    expect(r.action.kind === 'create_task' ? r.action.text : '').toContain('Call Jordan');
  });

  it('wires movement grammar into the executable request path', () => {
    const r = runEngineCycle({
      utterance: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.',
      workingMemory: emptyWorkingMemory(),
    });
    expect(r.request.primaryVerb).toBe('go');
    expect(r.request.locationText).toBe('Bunnings');
    expect(r.request.objectText).toContain('2 cartridges of clear Sika MS');
    expect(r.request.objectText).toContain('2 sausages of Sika White MS');
    expect(r.action.kind).toBe('create_task');
    expect(r.action.kind === 'create_task' ? r.action.locationText : '').toBe('Bunnings');
  });

  it('retains the grammar relation graph as deterministic evidence', () => {
    const r = runEngineCycle({
      utterance: 'I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.',
      workingMemory: emptyWorkingMemory(),
    });
    expect(r.semantic.grammar.relations).toEqual(
      expect.arrayContaining(['action→destination', 'destination→purpose', 'purpose→object'])
    );
    expect(r.request.constraints.some((c) => c.value === 'relation:action→destination')).toBe(true);
  });
});
