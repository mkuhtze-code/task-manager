import { describe, expect, it } from 'vitest';
import { fromEngineInterpretation, fromSpeechInterpretation } from '@/lib/semantic-contract/adapters';
import type { SemanticEnvelope } from '@/lib/semantic-contract/envelope';
import { interpretSemanticInput } from '@/lib/engine/semanticInterpreter';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';

/**
 * Phase N reviewed-label baseline.
 *
 * Labels express the minimum semantic meaning a human reviewer expects from
 * each utterance. This first pass reports coverage; it intentionally sets no
 * producer correctness threshold until the observed gaps have been reviewed.
 * The report is diagnostic and does not authorize task execution.
 */
type Feature =
  | 'action' | 'negation' | 'correction' | 'condition' | 'dependency'
  | 'question' | 'temporal' | 'entity' | 'reference' | 'observation' | 'multiple_acts';

type LabelCase = {
  id: string;
  domain: string;
  input: string;
  expectedMeaning: string;
  requiredFeatures: Feature[];
};

const TODAY = '2026-10-12';

const LABELS: LabelCase[] = [
  { id: 'life-reminder-time', domain: 'personal', input: 'Remind me to take the birthday cake out of the freezer at 3pm tomorrow.', expectedMeaning: 'A reminder action with an object and a future time.', requiredFeatures: ['action', 'temporal'] },
  { id: 'life-negated-shopping', domain: 'personal', input: 'I bought milk already, so do not add it to the shopping list.', expectedMeaning: 'A completed event followed by an explicitly prohibited list mutation.', requiredFeatures: ['negation'] },
  { id: 'communication-purpose', domain: 'communication', input: 'Call Priya to ask whether she can move our meeting to Friday.', expectedMeaning: 'Call Priya; asking about moving the meeting is the purpose, not a second independent command by default.', requiredFeatures: ['action', 'temporal', 'entity'] },
  { id: 'communication-correction', domain: 'communication', input: 'Email Chris on Wednesday, no wait, Thursday.', expectedMeaning: 'Email Chris on Thursday; Thursday supersedes Wednesday.', requiredFeatures: ['action', 'correction', 'temporal'] },
  { id: 'office-condition', domain: 'office', input: 'Send the revised proposal to Lee after finance signs off.', expectedMeaning: 'Send the proposal to Lee only after finance approval.', requiredFeatures: ['action', 'dependency'] },
  { id: 'research-question', domain: 'research', input: 'What are the main differences between a compiler and an interpreter?', expectedMeaning: 'An information-seeking question, not an instruction to create a task.', requiredFeatures: ['question'] },
  { id: 'creative-constraint', domain: 'creative', input: 'Sketch three cover concepts using orange and blue, but keep the original headline.', expectedMeaning: 'Create three cover concepts with a palette constraint while preserving the headline.', requiredFeatures: ['action', 'multiple_acts'] },
  { id: 'travel-route', domain: 'travel', input: 'If the ferry is cancelled, find a route that gets us there by noon.', expectedMeaning: 'Find a fallback route conditional on cancellation with a noon deadline.', requiredFeatures: ['action', 'condition', 'temporal'] },
  { id: 'site-delivery', domain: 'construction', input: 'Take the sealant to 18 Kauri Road before the crew arrives at 7.', expectedMeaning: 'Deliver the sealant to a physical address before the crew arrives at a stated time.', requiredFeatures: ['action', 'temporal', 'dependency', 'entity'] },
  { id: 'novel-vocabulary', domain: 'unfamiliar-vocabulary', input: 'Ask Rowan to rekalibrate the luminance map after the sensor swap.', expectedMeaning: 'Ask Rowan to perform an unfamiliar action on the luminance map after a prerequisite event.', requiredFeatures: ['action', 'dependency', 'entity'] },
  { id: 'observation-not-task', domain: 'everyday', input: 'The thingamajig is making a high-pitched noise again.', expectedMeaning: 'An observation about an unfamiliar object, not an explicit command.', requiredFeatures: ['observation'] },
  { id: 'multi-action', domain: 'personal', input: 'Renew my passport, then compare flights before we book anything.', expectedMeaning: 'Renew the passport, then compare flights; booking is explicitly deferred.', requiredFeatures: ['action', 'multiple_acts', 'dependency'] },
  { id: 'schedule-correction', domain: 'office', input: 'Move the review from 2pm to 3:30pm, not 4.', expectedMeaning: 'Change the review time to 3:30pm and reject 4pm.', requiredFeatures: ['action', 'correction', 'temporal', 'negation'] },
  { id: 'explicit-separate-task', domain: 'work', input: 'Keep the current task, and create a separate task to review the budget next Tuesday.', expectedMeaning: 'Preserve the existing task and create a distinct budget-review task for next Tuesday.', requiredFeatures: ['action', 'temporal', 'multiple_acts'] },
  { id: 'question-not-command', domain: 'travel', input: 'Can you explain whether the train arrives before the connection leaves?', expectedMeaning: 'Explain a temporal relationship; do not convert the question into a silent booking or travel task.', requiredFeatures: ['question', 'temporal'] },
  { id: 'spatial-contrast', domain: 'creative', input: 'Put the glimmerfold notes beside the atlas, not inside it.', expectedMeaning: 'Place the notes beside the atlas and explicitly reject placing them inside it.', requiredFeatures: ['action', 'negation', 'reference'] },
];

function featuresOf(envelope: SemanticEnvelope): Set<Feature> {
  const acts = envelope.acts;
  const features = new Set<Feature>();
  if (acts.some((act) => act.kind === 'action' && !!act.actionVerb)) features.add('action');
  if (acts.some((act) => act.polarity === 'negated') ||
      envelope.context.evidence.some((item) => /negat|prohibit|must_not/i.test(item))) features.add('negation');
  if (envelope.correctionChain.length > 0 ||
      acts.some((act) => act.corrections.length > 0) ||
      envelope.context.isCorrection) features.add('correction');
  if (acts.some((act) => !!act.condition) ||
      envelope.relations.some((relation) => relation.kind === 'condition')) features.add('condition');
  if (acts.some((act) => !!act.dependency) ||
      envelope.relations.some((relation) => relation.kind === 'dependency') ||
      envelope.relations.some((relation) => /after|before|until|once/i.test(relation.raw))) features.add('dependency');
  if (acts.some((act) => act.kind === 'question') ||
      /question|interrogative/i.test(envelope.context.speechAct ?? '') ||
      /^(ask|explain|search|question)$/i.test(envelope.context.intent ?? '')) features.add('question');
  if (envelope.temporalExpressions.length > 0 ||
      acts.some((act) => !!act.temporalRaw || !!act.temporalResolvedDate) ||
      !!envelope.context.dateHint || !!envelope.context.timeHint) features.add('temporal');
  if (envelope.entities.length > 0 || acts.some((act) => act.entityLinks.length > 0)) features.add('entity');
  if (acts.some((act) => act.references.length > 0) ||
      envelope.relations.some((relation) => relation.kind === 'reference')) features.add('reference');
  if (acts.some((act) => act.kind === 'observation')) features.add('observation');
  if (acts.length > 1) features.add('multiple_acts');
  return features;
}

function missingFeatures(envelope: SemanticEnvelope, expected: Feature[]): Feature[] {
  const observed = featuresOf(envelope);
  return expected.filter((feature) => !observed.has(feature));
}

describe('Phase N — reviewed semantic label baseline (diagnostic, no score gate)', () => {
  it('compares speech and engine envelopes against cross-domain reviewed expectations', () => {
    const rows = LABELS.map((label) => {
      const speech = processCaptureSpeech({ text: label.input, todayIso: TODAY }).pipeline.interpretation;
      const engine = interpretSemanticInput(label.input, {
        workingMemory: emptyWorkingMemory(TODAY),
        jobs: [],
        meetings: [],
      });
      const speechEnvelope = speech
        ? fromSpeechInterpretation(speech)
        : null;
      const engineEnvelope = fromEngineInterpretation(engine);
      const speechMissing = speechEnvelope ? missingFeatures(speechEnvelope, label.requiredFeatures) : label.requiredFeatures;
      const engineMissing = missingFeatures(engineEnvelope, label.requiredFeatures);
      return {
        id: label.id,
        domain: label.domain,
        input: label.input,
        expectedMeaning: label.expectedMeaning,
        requiredFeatures: label.requiredFeatures,
        speech: {
          available: !!speechEnvelope,
          observedFeatures: speechEnvelope ? [...featuresOf(speechEnvelope)].sort() : [],
          missingFeatures: speechMissing,
          actCount: speechEnvelope?.acts.length ?? 0,
        },
        engine: {
          observedFeatures: [...featuresOf(engineEnvelope)].sort(),
          missingFeatures: engineMissing,
          actCount: engineEnvelope.acts.length,
          lossyProjection: engineEnvelope.provenance.lossyProjection,
        },
      };
    });

    const report = {
      benchmark: 'phase-n-reviewed-semantic-labels-v1',
      purpose: 'reviewed expectation coverage; diagnostic only; no correctness threshold yet',
      today: TODAY,
      caseCount: rows.length,
      domains: [...new Set(rows.map((row) => row.domain))].sort(),
      speechMissingFeatureCount: rows.reduce((n, row) => n + row.speech.missingFeatures.length, 0),
      engineMissingFeatureCount: rows.reduce((n, row) => n + row.engine.missingFeatures.length, 0),
      speechGaps: rows.filter((row) => row.speech.missingFeatures.length > 0).map((row) => ({
        id: row.id, missing: row.speech.missingFeatures,
      })),
      engineGaps: rows.filter((row) => row.engine.missingFeatures.length > 0).map((row) => ({
        id: row.id, missing: row.engine.missingFeatures,
      })),
      rows,
    };
    console.info('PHASE_N_REVIEWED_SEMANTIC_LABELS=' + JSON.stringify(report));

    // Integrity checks only. Gaps remain visible for review rather than hidden
    // behind arbitrary thresholds before the first measured baseline.
    expect(rows).toHaveLength(LABELS.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(LABELS.length);
    expect(report.domains.length).toBeGreaterThanOrEqual(8);
    expect(rows.every((row) => row.expectedMeaning.length > 0 && row.requiredFeatures.length > 0)).toBe(true);
    expect(rows.every((row) => row.engine.lossyProjection)).toBe(true);
  });
});
