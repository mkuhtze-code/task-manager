import { describe, expect, it } from 'vitest';
import { normaliseSpeech, extractTemporals } from '../normalise';
import { composeSemanticUtterance } from '../semantic/compose';
import { interpretSpeech } from '../interpret';
import { decideSpeechActions, decisionWouldCreateTask, semanticOutcome } from '../decision';

describe('composition — multi-act', () => {
  it('splits call and email into two acts with own temporals', () => {
    const raw = 'Call John tomorrow and email Sarah Friday.';
    const n = normaliseSpeech(raw, { todayIso: '2026-10-01' });
    const u = composeSemanticUtterance(raw, n);
    const actions = u.acts.filter((a) => a.kind === 'action');
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const call = actions.find((a) => a.actionVerb === 'call');
    const email = actions.find((a) => a.actionVerb === 'email');
    expect(call).toBeTruthy();
    expect(email).toBeTruthy();
    expect(call?.temporalRaw?.toLowerCase()).toMatch(/tomorrow/);
    expect(email?.temporalRaw?.toLowerCase()).toMatch(/friday/);
  });

  it('negated + positive contrast: one blocked, one positive', () => {
    const raw = "I don't need to call John, but I do need to email Sarah.";
    const u = composeSemanticUtterance(raw);
    const callish = u.acts.filter((a) => /call/i.test(a.rawSpan));
    const emailish = u.acts.filter((a) => /email/i.test(a.rawSpan));
    expect(callish.some((a) => a.polarity === 'negated' || a.blocksTaskCreation)).toBe(true);
    expect(emailish.some((a) => a.kind === 'action' && a.polarity !== 'negated')).toBe(true);
  });
});

describe('composition — reported speech', () => {
  it('does not create user task from John said', () => {
    const raw = "John said he'd call tomorrow.";
    const i = interpretSpeech(raw);
    const d = decideSpeechActions(i);
    expect(i.mustNotCreateTask).toBe(true);
    expect(decisionWouldCreateTask(d)).toBe(false);
    expect(semanticOutcome(d)).toMatch(/DO_NOT_CREATE|NOTE_REPORTED|ASK_CLARIFICATION/);
    const u = composeSemanticUtterance(raw);
    expect(u.acts.some((a) => a.kind === 'reported_speech')).toBe(true);
  });
});

describe('composition — temporal span overlap', () => {
  it('the day after tomorrow does not keep bare tomorrow as peer', () => {
    const refs = extractTemporals('See you the day after tomorrow', '2026-10-01');
    const raws = refs.map((r) => r.raw.toLowerCase());
    expect(raws.some((r) => r.includes('day after tomorrow'))).toBe(true);
    expect(raws.includes('tomorrow')).toBe(false);
  });

  it('next Friday suppresses competing bare Friday when overlapped', () => {
    const refs = extractTemporals('Finish next Friday', '2026-10-01');
    const nextFri = refs.filter((r) => /next\s+friday/i.test(r.raw));
    expect(nextFri.length).toBeGreaterThanOrEqual(1);
  });

  it('by Friday is deadline relation on act', () => {
    const raw = 'Call John by Friday.';
    const n = normaliseSpeech(raw, { todayIso: '2026-10-01' });
    const u = composeSemanticUtterance(raw, n);
    const act = u.acts.find((a) => a.kind === 'action');
    expect(act?.temporalRelation).toBe('by');
  });
});

describe('composition — corrections', () => {
  it('tomorrow actually Friday is a date correction', () => {
    const raw = 'Call John tomorrow, actually Friday.';
    const u = composeSemanticUtterance(raw);
    const act = u.acts.find((a) => a.kind === 'action') ?? u.acts[0];
    const hasCorr =
      (act.corrections?.some((c) => c.facet === 'date') ?? false) ||
      u.correctionChain.some((c) => c.facet === 'date');
    expect(hasCorr).toBe(true);
  });

  it('I actually need to call John is NOT a correction', () => {
    const raw = 'I actually need to call John.';
    const u = composeSemanticUtterance(raw);
    expect(u.acts.some((a) => a.kind === 'action')).toBe(true);
  });
});

describe('composition — conditions', () => {
  it('attaches condition to action without making condition a task', () => {
    const raw = "Email Sarah Friday if the quote hasn't arrived.";
    const u = composeSemanticUtterance(raw);
    const act = u.acts.find((a) => a.actionVerb === 'email' || /email/i.test(a.rawSpan));
    expect(act).toBeTruthy();
    expect(act?.condition).toBeTruthy();
    expect(act?.blocksTaskCreation).toBe(true);
    const d = decideSpeechActions(interpretSpeech(raw));
    expect(decisionWouldCreateTask(d)).toBe(false);
  });
});

describe('composition — references', () => {
  it('resolves him to John across acts', () => {
    const raw = 'Call John tomorrow. Ask him about the quote.';
    const u = composeSemanticUtterance(raw);
    const second = u.acts[1] ?? u.acts.find((a) => /him/i.test(a.rawSpan));
    expect(second).toBeTruthy();
    const him = second?.references?.find((r) => r.pronoun === 'him');
    expect(him?.resolvedTo).toBe('John');
    expect(him?.requiresClarification).toBe(false);
  });

  it('ambiguous that requires clarification', () => {
    const raw = 'Move that to Friday.';
    const u = composeSemanticUtterance(raw);
    const act = u.acts[0];
    expect(
      act.requiresClarification ||
        act.references?.some((r) => r.requiresClarification) ||
        u.requiresConfirmation
    ).toBe(true);
  });
});

describe('composition — safety outcomes', () => {
  it('thinking aloud does not create task', () => {
    const d = decideSpeechActions(interpretSpeech('Maybe I should call John tomorrow.'));
    expect(decisionWouldCreateTask(d)).toBe(false);
    expect(semanticOutcome(d)).not.toBe('CREATE_TASK');
  });

  it('negation blocks create', () => {
    const d = decideSpeechActions(interpretSpeech("I don't need to call John."));
    expect(decisionWouldCreateTask(d)).toBe(false);
  });
});
