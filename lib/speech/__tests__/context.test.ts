import { describe, expect, it } from 'vitest';
import { composeSemanticUtterance } from '../semantic/compose';
import { linkEntitiesInText, type SpeechUnderstandingContext } from '../semantic/context';
import { interpretSpeech } from '../interpret';
import { decideSpeechActions, semanticOutcome } from '../decision';

const ctx: SpeechUnderstandingContext = {
  people: [
    { id: 'p-mike', label: 'Mike', kind: 'person', aliases: ['Michael'] },
    { id: 'p-sarah', label: 'Sarah', kind: 'person' },
  ],
  jobs: [
    {
      id: 'j-hend',
      label: 'Henderson extension',
      kind: 'job',
      aliases: ['Henderson', 'Hendo'],
      recency: 0.9,
    },
  ],
  focusEntityIds: ['j-hend'],
};

describe('context entity linking', () => {
  it('links Henderson job by alias', () => {
    const links = linkEntitiesInText('Call about the Henderson job', ctx);
    expect(links.some((l) => l.entityId === 'j-hend')).toBe(true);
  });

  it('links Hendo alias', () => {
    const links = linkEntitiesInText('Photos for Hendo', ctx);
    expect(links.some((l) => l.entityId === 'j-hend' && l.source === 'alias')).toBe(true);
  });

  it('compose attaches entityLinks', () => {
    const u = composeSemanticUtterance('Chase the Henderson job quote', undefined, ctx);
    const act = u.acts[0];
    expect(act.entityLinks?.some((l) => l.entityId === 'j-hend')).toBe(true);
  });
});

describe('context focus pronouns', () => {
  it('resolves that to focused job', () => {
    const u = composeSemanticUtterance('Move that to Friday', undefined, ctx);
    const act = u.acts[0];
    const that = act.references?.find((r) => r.pronoun === 'that');
    expect(that?.resolvedTo).toMatch(/Henderson/i);
    expect(that?.requiresClarification).toBe(false);
  });

  it('without context, ambiguous that asks clarification', () => {
    const u = composeSemanticUtterance('Move that to Friday');
    const act = u.acts[0];
    expect(
      act.requiresClarification ||
        act.references?.some((r) => r.requiresClarification) ||
        u.requiresConfirmation
    ).toBe(true);
  });
});

describe('context person resolution', () => {
  it('links Mike from context on call', () => {
    const u = composeSemanticUtterance('Call Mike tomorrow', undefined, ctx);
    expect(u.acts[0].entityLinks?.some((l) => l.entityId === 'p-mike')).toBe(true);
  });
});

describe('update existing context outcome', () => {
  it('move that with focus can target existing', () => {
    const i = interpretSpeech('Move that to Friday', { understandingContext: ctx });
    const d = decideSpeechActions(i);
    const outcome = semanticOutcome(d);
    expect(['UPDATE_EXISTING_CONTEXT', 'ASK_CLARIFICATION', 'DO_NOT_CREATE']).toContain(outcome);
  });
});

describe('safety preserved with context', () => {
  it('reported speech still blocks create', () => {
    const i = interpretSpeech("John said he'd call tomorrow.", { understandingContext: ctx });
    const d = decideSpeechActions(i);
    expect(d.mustNotCreateTask).toBe(true);
  });
});
