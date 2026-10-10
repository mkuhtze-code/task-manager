import { describe, expect, it } from 'vitest';
import type { SemanticEnvelope } from '@/lib/semantic-contract/envelope';
import { fromEngineInterpretation, fromSpeechInterpretation } from '@/lib/semantic-contract/adapters';
import { interpretSemanticInput } from '@/lib/engine/semanticInterpreter';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';
import {
  evaluateSemanticExpectation,
  summarizeSemanticExpectationResults,
  type ObservedSemanticFacts,
  type SemanticExpectation,
} from '@/lib/semantic-contract/semanticExpectationScoring';

const TODAY = '2026-10-12';

/**
 * Reviewed semantic assertions. These deliberately encode positive AND
 * negative expectations rather than treating unlabelled observations as truth.
 * The scores are diagnostic until reviewers agree on label interpretation and
 * release thresholds; no current producer is presumed correct.
 */
const EXPECTATIONS: SemanticExpectation[] = [
  { id: 'reminder-cake-time', domain: 'personal', input: 'Remind me to take the birthday cake out of the freezer at 3pm tomorrow.', expected: { minActs: 1, requiredActionTerms: ['take'], requiredTemporalTerms: ['3pm'], mustNotCreateTask: false } },
  { id: 'prohibited-list-mutation', domain: 'personal', input: 'I bought milk already, so do not add it to the shopping list.', expected: { minActs: 1, mustHaveNegation: true } },
  { id: 'call-purpose', domain: 'communication', input: 'Call Priya to ask whether she can move our meeting to Friday.', expected: { minActs: 1, requiredActionTerms: ['call'], requiredEntityTerms: ['Priya'], requiredTemporalTerms: ['Friday'] } },
  { id: 'date-correction', domain: 'communication', input: 'Email Chris on Wednesday, no wait, Thursday.', expected: { minActs: 1, requiredActionTerms: ['email'], requiredEntityTerms: ['Chris'], requiredTemporalTerms: ['Thursday'], mustHaveCorrection: true } },
  { id: 'approval-dependency', domain: 'office', input: 'Send the revised proposal to Lee after finance signs off.', expected: { minActs: 1, requiredActionTerms: ['send'], requiredEntityTerms: ['Lee'], mustHaveDependency: true } },
  { id: 'information-question', domain: 'research', input: 'What are the main differences between a compiler and an interpreter?', expected: { minActs: 1, requiredActKinds: ['question'], mustNotCreateTask: true, forbiddenActionTerms: ['create task'] } },
  { id: 'creative-preservation', domain: 'creative', input: 'Sketch three cover concepts using orange and blue, but keep the original headline.', expected: { minActs: 1, requiredActionTerms: ['sketch'], requiredEntityTerms: ['headline'] } },
  { id: 'conditional-travel-fallback', domain: 'travel', input: 'If the ferry is cancelled, find a route that gets us there by noon.', expected: { minActs: 1, requiredActionTerms: ['find'], requiredTemporalTerms: ['noon'], mustHaveCondition: true } },
  { id: 'delivery-address-deadline', domain: 'home-and-business', input: 'Take the sealant to 18 Kauri Road before the crew arrives at 7.', expected: { minActs: 1, requiredActionTerms: ['take'], requiredEntityTerms: ['18 Kauri Road'], requiredTemporalTerms: ['7'], mustHaveDependency: true } },
  { id: 'observation-not-command', domain: 'everyday', input: 'The thingamajig is making a high-pitched noise again.', expected: { minActs: 1, requiredActKinds: ['observation'], mustNotCreateTask: true } },
  { id: 'multi-act-deferred-booking', domain: 'travel', input: 'Renew my passport, then compare flights before we book anything.', expected: { minActs: 2, requiredActionTerms: ['renew', 'compare'], mustHaveDependency: true, forbiddenActionTerms: ['book'] } },
  { id: 'question-not-booking', domain: 'travel', input: 'Can you explain whether the train arrives before the connection leaves?', expected: { minActs: 1, requiredActKinds: ['question'], mustNotCreateTask: true, forbiddenActionTerms: ['book'] } },
  { id: 'spatial-negation', domain: 'creative', input: 'Put the glimmerfold notes beside the atlas, not inside it.', expected: { minActs: 1, requiredActionTerms: ['put'], requiredEntityTerms: ['atlas'], mustHaveNegation: true } },
  { id: 'explicit-separate-task', domain: 'work', input: 'Keep the current task, and create a separate task to review the budget next Tuesday.', expected: { minActs: 2, requiredActionTerms: ['create', 'review'], requiredTemporalTerms: ['Tuesday'] } },
  { id: 'unfamiliar-vocabulary', domain: 'unfamiliar-vocabulary', input: 'Ask Rowan to rekalibrate the luminance map after the sensor swap.', expected: { minActs: 1, requiredActionTerms: ['ask'], requiredEntityTerms: ['Rowan'], mustHaveDependency: true } },
  { id: 'conditional-non-task-contrast', domain: 'home', input: 'If the power returns before noon, check whether the router reconnects.', expected: { minActs: 1, requiredActionTerms: ['check'], requiredTemporalTerms: ['noon'], mustHaveCondition: true } },
];

function factsOf(envelope: SemanticEnvelope | null): ObservedSemanticFacts {
  if (!envelope) return {
    actCount: 0, actKinds: [], actionText: '', entityText: '', temporalText: '',
    mustNotCreateTask: false, hasNegation: false, hasCorrection: false, hasCondition: false, hasDependency: false,
  };
  const acts = envelope.acts;
  const actionText = acts.filter((act) => act.kind === 'action' || act.kind === 'commitment')
    .flatMap((act) => [act.actionVerb, act.objectText].filter(Boolean) as string[]).join(' ');
  const entityText = [
    ...envelope.entities.map((entity) => entity.raw),
    ...acts.flatMap((act) => [act.sourceSpeaker, act.subjectText, ...act.entityLinks.map((link) => link.label)].filter(Boolean) as string[]),
  ].join(' ');
  const temporalText = [
    ...envelope.temporalExpressions.flatMap((item) => [item.raw, item.resolvedDate, item.resolvedTime].filter(Boolean) as string[]),
    ...acts.flatMap((act) => [act.temporalRaw, act.temporalResolvedDate].filter(Boolean) as string[]),
    ...envelope.relations.map((relation) => relation.raw),
  ].join(' ');
  return {
    actCount: acts.length,
    actKinds: acts.map((act) => act.kind),
    actionText,
    entityText,
    temporalText,
    mustNotCreateTask: envelope.context.mustNotCreateTask || acts.some((act) => act.blocksTaskCreation),
    hasNegation: acts.some((act) => act.polarity === 'negated') ||
      envelope.context.evidence.some((item) => /negat|prohibit|must_not/i.test(item)),
    hasCorrection: envelope.correctionChain.length > 0 ||
      acts.some((act) => act.corrections.length > 0) || envelope.context.isCorrection,
    hasCondition: acts.some((act) => !!act.condition) || envelope.relations.some((relation) => relation.kind === 'condition'),
    hasDependency: acts.some((act) => !!act.dependency) || envelope.relations.some((relation) => relation.kind === 'dependency'),
  };
}

function interpret(input: string, producer: 'speech' | 'engine'): SemanticEnvelope | null {
  if (producer === 'speech') {
    const result = processCaptureSpeech({ text: input, todayIso: TODAY }).pipeline.interpretation;
    return result ? fromSpeechInterpretation(result) : null;
  }
  const result = interpretSemanticInput(input, {
    workingMemory: emptyWorkingMemory(TODAY),
    jobs: [],
    meetings: [],
  });
  return fromEngineInterpretation(result);
}

describe('Phase N semantic expectation scoring (diagnostic, no release threshold)', () => {
  it('scores reviewed positive and negative expectations separately for both producers', () => {
    const run = (producer: 'speech' | 'engine') => EXPECTATIONS.map((label) => ({
      label,
      result: evaluateSemanticExpectation(label, factsOf(interpret(label.input, producer))),
    }));
    const speech = run('speech');
    const engine = run('engine');
    const speechSummary = summarizeSemanticExpectationResults(speech.map((row) => row.result));
    const engineSummary = summarizeSemanticExpectationResults(engine.map((row) => row.result));

    console.info('PHASE_N_SEMANTIC_ACCURACY=' + JSON.stringify({
      benchmark: 'phase-n-semantic-expectations-v1',
      labelCount: EXPECTATIONS.length,
      domains: [...new Set(EXPECTATIONS.map((label) => label.domain))].sort(),
      speech: speechSummary,
      engine: engineSummary,
      speechFailures: speech.filter((row) => row.result.failed > 0).map((row) => ({ id: row.label.id, criteria: row.result.criteria.filter((item) => !item.passed) })),
      engineFailures: engine.filter((row) => row.result.failed > 0).map((row) => ({ id: row.label.id, criteria: row.result.criteria.filter((item) => !item.passed) })),
    }));

    expect(EXPECTATIONS).toHaveLength(16);
    expect(new Set(EXPECTATIONS.map((label) => label.id)).size).toBe(EXPECTATIONS.length);
    expect(new Set(EXPECTATIONS.map((label) => label.domain)).size).toBeGreaterThanOrEqual(8);
    expect(EXPECTATIONS.every((label) => Object.keys(label.expected).length > 0)).toBe(true);
    expect(speechSummary.cases).toBe(EXPECTATIONS.length);
    expect(engineSummary.cases).toBe(EXPECTATIONS.length);
    expect(speechSummary.criteria).toBeGreaterThan(0);
    expect(engineSummary.criteria).toBe(speechSummary.criteria);
  });
});

describe('semantic expectation scorer', () => {
  const observed: ObservedSemanticFacts = {
    actCount: 1,
    actKinds: ['question'],
    actionText: '',
    entityText: 'compiler interpreter',
    temporalText: '',
    mustNotCreateTask: true,
    hasNegation: false,
    hasCorrection: false,
    hasCondition: false,
    hasDependency: false,
  };

  it('scores required positive and negative assertions explicitly', () => {
    const result = evaluateSemanticExpectation({
      id: 'question', domain: 'research', input: 'What is this?',
      expected: { minActs: 1, requiredActKinds: ['question'], forbiddenActKinds: ['action'], mustNotCreateTask: true },
    }, observed);
    expect(result.failed).toBe(0);
    expect(result.passed).toBe(4);
    expect(result.score).toBe(1);
  });

  it('records false actions as failed negative assertions', () => {
    const result = evaluateSemanticExpectation({
      id: 'not-a-task', domain: 'research', input: 'What is this?',
      expected: { forbiddenActionTerms: ['book'], mustNotCreateTask: true },
    }, { ...observed, actionText: 'book train' });
    expect(result.failed).toBe(1);
    expect(result.criteria.find((item) => item.criterion === 'forbiddenActionTerm:book')?.passed).toBe(false);
  });

  it('reports null score when no criteria are defined', () => {
    const result = evaluateSemanticExpectation({
      id: 'empty', domain: 'research', input: 'Hello', expected: {},
    }, observed);
    expect(result.score).toBeNull();
  });
});
