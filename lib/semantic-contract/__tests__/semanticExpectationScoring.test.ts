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
 * Candidate semantic assertions authored for evaluation development. They encode
 * positive AND negative expectations but are NOT yet human-reviewed gold labels.
 * Scores remain diagnostic until each expectation is reviewed and release rules
 * are agreed; no current producer is presumed correct.
 */
const EXPECTATIONS: SemanticExpectation[] = [
  { id: 'reminder-cake-time', domain: 'personal', input: 'Remind me to take the birthday cake out of the freezer at 3pm tomorrow.', expected: { minActs: 1, requiredActionTerms: ['take'], requiredPredicateTerms: ['take'], requiredObjectTerms: ['birthday cake'], requiredTemporalTerms: ['3pm'], mustNotCreateTask: false } },
  { id: 'prohibited-list-mutation', domain: 'personal', input: 'I bought milk already, so do not add it to the shopping list.', expected: { minActs: 1, mustHaveNegation: true } },
  { id: 'call-purpose', domain: 'communication', input: 'Call Priya to ask whether she can move our meeting to Friday.', expected: { minActs: 1, requiredActionTerms: ['call'], requiredPredicateTerms: ['call'], requiredPersonTerms: ['Priya'], requiredEntityTerms: ['Priya'], requiredTemporalTerms: ['Friday'] } },
  { id: 'date-correction', domain: 'communication', input: 'Email Chris on Wednesday, no wait, Thursday.', expected: { minActs: 1, requiredActionTerms: ['email'], requiredPredicateTerms: ['email'], requiredPersonTerms: ['Chris'], requiredEntityTerms: ['Chris'], requiredTemporalTerms: ['Thursday'], requiredCorrectionFacets: ['date'], mustHaveCorrection: true } },
  { id: 'approval-dependency', domain: 'office', input: 'Send the revised proposal to Lee after finance signs off.', expected: { minActs: 1, requiredActionTerms: ['send'], requiredPredicateTerms: ['send'], requiredObjectTerms: ['proposal'], requiredPersonTerms: ['Lee'], requiredEntityTerms: ['Lee'], requiredRelationTerms: ['after'], mustHaveDependency: true } },
  { id: 'information-question', domain: 'research', input: 'What are the main differences between a compiler and an interpreter?', expected: { minActs: 1, requiredActKinds: ['question'], mustNotCreateTask: true, forbiddenActionTerms: ['create task'] } },
  { id: 'creative-preservation', domain: 'creative', input: 'Sketch three cover concepts using orange and blue, but keep the original headline.', expected: { minActs: 1, requiredActionTerms: ['sketch'], requiredPredicateTerms: ['sketch'], requiredObjectTerms: ['cover concepts'], requiredEntityTerms: ['headline'] } },
  { id: 'conditional-travel-fallback', domain: 'travel', input: 'If the ferry is cancelled, find a route that gets us there by noon.', expected: { minActs: 1, requiredActionTerms: ['find'], requiredPredicateTerms: ['find'], requiredObjectTerms: ['route'], requiredTemporalTerms: ['noon'], requiredRelationTerms: ['if'], mustHaveCondition: true } },
  { id: 'delivery-address-deadline', domain: 'home-and-business', input: 'Take the sealant to 18 Kauri Road before the crew arrives at 7.', expected: { minActs: 1, requiredActionTerms: ['take'], requiredPredicateTerms: ['take'], requiredObjectTerms: ['sealant'], requiredEntityTerms: ['18 Kauri Road'], requiredTemporalTerms: ['7'], requiredRelationTerms: ['before'], mustHaveDependency: true } },
  { id: 'observation-not-command', domain: 'everyday', input: 'The thingamajig is making a high-pitched noise again.', expected: { minActs: 1, requiredActKinds: ['observation'], mustNotCreateTask: true } },
  { id: 'multi-act-deferred-booking', domain: 'travel', input: 'Renew my passport, then compare flights before we book anything.', expected: { minActs: 2, requiredActionTerms: ['renew', 'compare'], requiredPredicateTerms: ['renew', 'compare'], mustHaveDependency: true, forbiddenActionTerms: ['book'] } },
  { id: 'question-not-booking', domain: 'travel', input: 'Can you explain whether the train arrives before the connection leaves?', expected: { minActs: 1, requiredActKinds: ['question'], mustNotCreateTask: true, forbiddenActionTerms: ['book'] } },
  { id: 'spatial-negation', domain: 'creative', input: 'Put the glimmerfold notes beside the atlas, not inside it.', expected: { minActs: 1, requiredActionTerms: ['put'], requiredPredicateTerms: ['put'], requiredObjectTerms: ['glimmerfold notes'], requiredEntityTerms: ['atlas'], requiredRelationTerms: ['beside', 'not inside'], mustHaveNegation: true } },
  { id: 'explicit-separate-task', domain: 'work', input: 'Keep the current task, and create a separate task to review the budget next Tuesday.', expected: { minActs: 2, requiredActionTerms: ['create', 'review'], requiredPredicateTerms: ['create', 'review'], requiredObjectTerms: ['budget'], requiredTemporalTerms: ['Tuesday'] } },
  { id: 'unfamiliar-vocabulary', domain: 'unfamiliar-vocabulary', input: 'Ask Rowan to rekalibrate the luminance map after the sensor swap.', expected: { minActs: 1, requiredActionTerms: ['ask'], requiredPredicateTerms: ['ask'], requiredPersonTerms: ['Rowan'], requiredEntityTerms: ['Rowan'], requiredRelationTerms: ['after'], mustHaveDependency: true } },
  { id: 'schedule-time-correction', domain: 'office', input: 'Move the review from 2pm to 3:30pm, not 4.', expected: { minActs: 1, requiredActionTerms: ['move'], requiredPredicateTerms: ['move'], requiredObjectTerms: ['review'], requiredTemporalTerms: ['3:30pm'], requiredCorrectionFacets: ['time'], mustHaveCorrection: true, mustHaveNegation: true } },
];

function factsOf(envelope: SemanticEnvelope | null): ObservedSemanticFacts {
  if (!envelope) return {
    actCount: 0, actKinds: [], actionText: '', predicateText: '', objectText: '', subjectText: '',
    personText: '', entityText: '', temporalText: '', relationText: '', correctionFacets: [],
    mustNotCreateTask: false, hasNegation: false, hasCorrection: false, hasCondition: false, hasDependency: false,
  };
  const acts = envelope.acts;
  const executableActs = acts.filter((act) => act.kind === 'action' || act.kind === 'commitment');
  const actionText = executableActs
    .flatMap((act) => [act.actionVerb, act.objectText].filter(Boolean) as string[]).join(' ');
  const predicateText = executableActs.map((act) => act.actionVerb).filter(Boolean).join(' ');
  const objectText = executableActs.map((act) => act.objectText).filter(Boolean).join(' ');
  const subjectText = acts.map((act) => act.subjectText).filter(Boolean).join(' ');
  const personText = [
    ...envelope.entities.filter((entity) => /person|contact|human/i.test(entity.kind)).map((entity) => entity.raw),
    ...acts.flatMap((act) => act.entityLinks.filter((link) => /person|contact|human/i.test(link.kind)).map((link) => link.label)),
  ].join(' ');
  const entityText = [
    ...envelope.entities.map((entity) => entity.raw),
    ...acts.flatMap((act) => [act.sourceSpeaker, act.subjectText, ...act.entityLinks.map((link) => link.label)].filter(Boolean) as string[]),
  ].join(' ');
  const temporalText = [
    ...envelope.temporalExpressions.flatMap((item) => [item.raw, item.resolvedDate, item.resolvedTime].filter(Boolean) as string[]),
    ...acts.flatMap((act) => [act.temporalRaw, act.temporalResolvedDate].filter(Boolean) as string[]),
    ...envelope.relations.map((relation) => relation.raw),
  ].join(' ');
  const relationText = [
    ...acts.flatMap((act) => [act.temporalRelation, act.condition?.raw, act.dependency?.raw].filter(Boolean) as string[]),
    ...envelope.relations.map((relation) => relation.raw),
    ...envelope.constraints.map((constraint) => constraint.value),
  ].join(' ');
  const correctionFacets = [
    ...envelope.correctionChain.map((correction) => correction.facet),
    ...acts.flatMap((act) => act.corrections.map((correction) => correction.facet)),
  ];
  return {
    actCount: acts.length,
    actKinds: acts.map((act) => act.kind),
    actionText,
    predicateText,
    objectText,
    subjectText,
    personText,
    entityText,
    temporalText,
    relationText,
    correctionFacets,
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
  it('scores candidate positive and negative expectations separately for both producers', () => {
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
      annotationStatus: { candidatePendingHumanReview: EXPECTATIONS.length, reviewed: 0 },
      domains: [...new Set(EXPECTATIONS.map((label) => label.domain))].sort(),
      speech: speechSummary,
      engine: engineSummary,
      speechFailures: speech.filter((row) => row.result.failed > 0).map((row) => ({ id: row.label.id, criteria: row.result.criteria.filter((item) => !item.passed) })),
      engineFailures: engine.filter((row) => row.result.failed > 0).map((row) => ({ id: row.label.id, criteria: row.result.criteria.filter((item) => !item.passed) })),
    }));

    expect(EXPECTATIONS).toHaveLength(16);
    expect(EXPECTATIONS.every((label) => label.id.length > 0)).toBe(true);
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
    predicateText: '',
    objectText: '',
    subjectText: '',
    personText: '',
    entityText: 'compiler interpreter',
    temporalText: '',
    relationText: '',
    correctionFacets: [],
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

  it('keeps predicate and object roles separate instead of accepting a word anywhere', () => {
    const label: SemanticExpectation = {
      id: 'role-separation', domain: 'personal', input: 'Remind me to take the birthday cake',
      expected: { requiredPredicateTerms: ['take'], requiredObjectTerms: ['birthday cake'] },
    };
    const result = evaluateSemanticExpectation(label, {
      ...observed,
      actionText: 'remind birthday cake out of the freezer',
      predicateText: 'remind',
      objectText: 'birthday cake out of the freezer',
    });
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.criteria.find((item) => item.criterion === 'requiredPredicateTerm:take')?.passed).toBe(false);
    expect(result.criteria.find((item) => item.criterion === 'requiredObjectTerm:birthday cake')?.passed).toBe(true);
  });

  it('checks correction facets rather than only correction presence', () => {
    const label: SemanticExpectation = {
      id: 'time-correction', domain: 'office', input: 'Move it to 3:30, no wait, 4',
      expected: { requiredCorrectionFacets: ['time'] },
    };
    expect(evaluateSemanticExpectation(label, { ...observed, correctionFacets: ['time'] }).score).toBe(1);
    expect(evaluateSemanticExpectation(label, { ...observed, correctionFacets: ['date'] }).score).toBe(0);
  });

  it('reports null score when no criteria are defined', () => {
    const result = evaluateSemanticExpectation({
      id: 'empty', domain: 'research', input: 'Hello', expected: {},
    }, observed);
    expect(result.score).toBeNull();
  });

  it('uses token boundaries so a time of 7 does not match the 7 inside a date', () => {
    const label: SemanticExpectation = {
      id: 'time-token', domain: 'personal', input: 'Do this at 7',
      expected: { requiredTemporalTerms: ['7'] },
    };
    expect(evaluateSemanticExpectation(label, { ...observed, temporalText: '2026-10-17' }).failed).toBe(1);
    expect(evaluateSemanticExpectation(label, { ...observed, temporalText: 'at 7 tomorrow' }).passed).toBe(1);
  });

  it('normalizes equivalent 12-hour, 24-hour and named midday expressions', () => {
    const atThreeThirty: SemanticExpectation = {
      id: 'time-alias-1530', domain: 'personal', input: 'Do this at 3:30pm',
      expected: { requiredTemporalTerms: ['3:30pm'] },
    };
    const atThree: SemanticExpectation = {
      id: 'time-alias-1500', domain: 'personal', input: 'Do this at 3pm',
      expected: { requiredTemporalTerms: ['3pm'] },
    };
    const atNoon: SemanticExpectation = {
      id: 'time-alias-noon', domain: 'personal', input: 'Do this at noon',
      expected: { requiredTemporalTerms: ['noon'] },
    };
    expect(evaluateSemanticExpectation(atThreeThirty, { ...observed, temporalText: '15:30' }).score).toBe(1);
    expect(evaluateSemanticExpectation(atThree, { ...observed, temporalText: '15:00' }).score).toBe(1);
    expect(evaluateSemanticExpectation(atNoon, { ...observed, temporalText: '12:00' }).score).toBe(1);
  });
});
