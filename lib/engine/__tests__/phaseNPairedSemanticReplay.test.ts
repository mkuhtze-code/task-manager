import { describe, expect, it } from 'vitest';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { interpretSemanticInput } from '@/lib/engine/semanticInterpreter';
import { emptyWorkingMemory } from '@/lib/engine/workingMemory';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';
import { fromEngineInterpretation, fromSpeechInterpretation } from '@/lib/semantic-contract/adapters';
import { compareSemanticEnvelopes, SHADOW_SIGNALS } from '@/lib/semantic-contract/shadowComparison';

/**
 * Phase N paired replay harness.
 *
 * This is a diagnostic baseline, not a release-quality score. It compares
 * typed input with the fixed transcript produced by Dokkit's deterministic
 * speech pipeline, then captures both engine semantic projections and the
 * speech pipeline's richer act representation. No task is persisted and no
 * draft corpus labels are treated as truth.
 */

type ReplayCase = {
  id: string;
  domain: string;
  input: string;
  capability: string[];
};

const TODAY = '2026-10-12';

const CASES: ReplayCase[] = [
  { id: 'life-reminder-time', domain: 'personal', input: 'Remind me to take the birthday cake out of the freezer at 3pm tomorrow.', capability: ['reminder', 'temporal'] },
  { id: 'life-negated-shopping', domain: 'personal', input: 'I bought milk already, so do not add it to the shopping list.', capability: ['negation', 'completed-event'] },
  { id: 'communication-purpose', domain: 'communication', input: 'Call Priya to ask whether she can move our meeting to Friday.', capability: ['nested-purpose', 'person-reference', 'temporal'] },
  { id: 'communication-correction', domain: 'communication', input: 'Email Chris on Wednesday, no wait, Thursday.', capability: ['correction', 'temporal'] },
  { id: 'office-condition', domain: 'office', input: 'Send the revised proposal to Lee after finance signs off.', capability: ['condition', 'dependency'] },
  { id: 'research-question', domain: 'research', input: 'What are the main differences between a compiler and an interpreter?', capability: ['question', 'information-seeking'] },
  { id: 'creative-constraint', domain: 'creative', input: 'Sketch three cover concepts using orange and blue, but keep the original headline.', capability: ['multiple-acts', 'constraint'] },
  { id: 'travel-route', domain: 'travel', input: 'If the ferry is cancelled, find a route that gets us there by noon.', capability: ['condition', 'fallback', 'deadline'] },
  { id: 'site-delivery', domain: 'construction', input: 'Take the sealant to 18 Kauri Road before the crew arrives at 7.', capability: ['delivery', 'location', 'dependency'] },
  { id: 'novel-vocabulary', domain: 'unfamiliar-vocabulary', input: 'Ask Rowan to rekalibrate the luminance map after the sensor swap.', capability: ['unknown-verb', 'nested-purpose'] },
  { id: 'observation-not-task', domain: 'everyday', input: 'The thingamajig is making a high-pitched noise again.', capability: ['observation', 'unfamiliar-noun'] },
  { id: 'multi-action', domain: 'personal', input: 'Renew my passport, then compare flights before we book anything.', capability: ['sequencing', 'multiple-acts'] },
  { id: 'schedule-correction', domain: 'office', input: 'Move the review from 2pm to 3:30pm, not 4.', capability: ['schedule-change', 'negation', 'correction'] },
  { id: 'explicit-separate-task', domain: 'work', input: 'Keep the current task, and create a separate task to review the budget next Tuesday.', capability: ['discourse', 'task-boundary', 'temporal'] },
  { id: 'question-not-command', domain: 'travel', input: 'Can you explain whether the train arrives before the connection leaves?', capability: ['question', 'temporal-relation'] },
  { id: 'spatial-contrast', domain: 'creative', input: 'Put the glimmerfold notes beside the atlas, not inside it.', capability: ['spatial-relation', 'negation', 'novel-noun'] },
  { id: 'finance-payment', domain: 'finance', input: 'Pay the electricity bill before the late fee starts on Thursday.', capability: ['action', 'deadline', 'condition'] },
  { id: 'finance-report-only', domain: 'finance', input: 'The electricity bill was paid this morning; nothing else is needed.', capability: ['past-event', 'non-action'] },
  { id: 'household-repair', domain: 'household', input: 'Find the leak under the kitchen sink and take a photo before touching anything.', capability: ['multi-action', 'sequencing', 'constraint'] },
  { id: 'household-observation', domain: 'household', input: 'There is a damp patch spreading across the laundry ceiling again.', capability: ['observation', 'recurrence'] },
  { id: 'cooking-sequence', domain: 'cooking', input: 'Defrost the soup overnight, then heat it gently before lunch.', capability: ['sequencing', 'temporal'] },
  { id: 'cooking-negated', domain: 'cooking', input: 'I already put the bread in the freezer, so do not buy another loaf.', capability: ['completed-event', 'negation'] },
  { id: 'writing-draft', domain: 'writing', input: 'Draft a short reply that thanks them but does not commit to a date.', capability: ['creation', 'constraint', 'negation'] },
  { id: 'writing-question', domain: 'writing', input: 'Does this paragraph actually answer the question, or does it wander off topic?', capability: ['question', 'evaluation'] },
  { id: 'software-bug', domain: 'software', input: 'Reproduce the login bug on a clean account and record the exact error message.', capability: ['multi-action', 'condition', 'evidence'] },
  { id: 'software-hypothesis', domain: 'software', input: 'Maybe the timeout is caused by the proxy, but we have not confirmed that.', capability: ['hypothesis', 'uncertainty', 'non-commitment'] },
  { id: 'learning-practice', domain: 'learning', input: 'Practice the new chord changes for ten minutes after dinner.', capability: ['action', 'duration', 'temporal'] },
  { id: 'learning-curiosity', domain: 'learning', input: 'Why does the same melody sound different when played in another key?', capability: ['information-question', 'non-task'] },
  { id: 'travel-booking', domain: 'travel', input: 'Compare the train and bus options, but do not book anything until I confirm.', capability: ['multi-action', 'constraint', 'negation'] },
  { id: 'travel-contingency', domain: 'travel', input: 'If the first flight is delayed, move the airport pickup to the updated arrival time.', capability: ['condition', 'correction', 'temporal'] },
  { id: 'care-appointment', domain: 'personal-care', input: 'Book a haircut for next week, preferably after 3pm.', capability: ['action', 'temporal', 'preference'] },
  { id: 'care-report-only', domain: 'personal-care', input: 'The appointment went well yesterday and there is no follow-up planned.', capability: ['past-event', 'non-action'] },
  { id: 'team-dependency', domain: 'teamwork', input: 'Send the release notes once Morgan approves the final build.', capability: ['dependency', 'condition', 'communication'] },
  { id: 'team-uncertain', domain: 'teamwork', input: 'Morgan might review the build tomorrow, but that is not confirmed.', capability: ['uncertainty', 'temporal', 'non-commitment'] },
  { id: 'correction-time', domain: 'general', input: 'Set the reminder for 8am, no wait, 9am.', capability: ['correction', 'temporal'] },
  { id: 'correction-place', domain: 'general', input: 'Leave it at the front desk — actually, put it in the parcel locker.', capability: ['correction', 'spatial-relation'] },
  { id: 'conditional-stop', domain: 'general', input: 'Do not send the message unless I approve the final wording.', capability: ['negation', 'condition', 'authorization'] },
  { id: 'separate-actions', domain: 'general', input: 'Keep that task unchanged and create a separate one to renew the insurance next month.', capability: ['task-boundary', 'multi-action', 'temporal'] },
  { id: 'ambiguous-reference', domain: 'general', input: 'Move the other one to Friday, not the one we just discussed.', capability: ['reference-resolution', 'negation', 'clarification'] },
  { id: 'unknown-domain-vocabulary', domain: 'unfamiliar-vocabulary', input: 'Ask Noor to recalibrate the fluxgate after the firmware swap.', capability: ['novel-vocabulary', 'nested-purpose'] },
];

type EngineProjection = {
  speechAct: string;
  intent: string;
  primaryVerb: string | null;
  personText: string | null;
  purposeText: string | null;
  subjectText: string | null;
  objectText: string | null;
  locationText: string | null;
  dateHint: string | null;
  timeHint: string | null;
  relatedJobText: string | null;
  relatedMeetingText: string | null;
  isRefinement: boolean;
  isCorrection: boolean;
  confidence: string;
  referenceStatus: string | null;
  grammarRelations: string[];
};

function projectEngine(text: string): EngineProjection {
  const result = interpretSemanticInput(text, {
    workingMemory: emptyWorkingMemory(TODAY),
    jobs: [],
    meetings: [],
  });
  return {
    speechAct: result.speechAct,
    intent: result.intent,
    primaryVerb: result.primaryVerb,
    personText: result.personText,
    purposeText: result.purposeText,
    subjectText: result.subjectText,
    objectText: result.objectText,
    locationText: result.locationText,
    dateHint: result.dateHint,
    timeHint: result.timeHint,
    relatedJobText: result.relatedJobText,
    relatedMeetingText: result.relatedMeetingText,
    isRefinement: result.isRefinement,
    isCorrection: result.isCorrection,
    confidence: result.confidence,
    referenceStatus: result.reference?.status ?? null,
    grammarRelations: [...result.grammar.relations],
  };
}

function differences(a: EngineProjection, b: EngineProjection): string[] {
  return (Object.keys(a) as Array<keyof EngineProjection>).filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
}

describe('Phase N — paired typed/transcript semantic replay (diagnostic baseline)', () => {
  it('records path parity, speech acts, and field-level differences across unrelated domains', () => {
    const observations = CASES.map((item) => {
      const speech = processCaptureSpeech({ text: item.input, todayIso: TODAY });
      const transcript = textForCaptureField(speech);
      const typedEngine = projectEngine(item.input);
      const transcriptEngine = projectEngine(transcript);
      const speechInterpretation = speech.pipeline.interpretation;
      const pairedEngineInterpretation = interpretSemanticInput(speechInterpretation?.normalisedText ?? item.input, {
        workingMemory: emptyWorkingMemory(TODAY),
        jobs: [],
        meetings: [],
      });
      const semanticShadow = speechInterpretation
        ? compareSemanticEnvelopes(
            fromSpeechInterpretation(speechInterpretation),
            fromEngineInterpretation(pairedEngineInterpretation),
          )
        : null;
      const speechActs = (speechInterpretation?.semantic?.acts ?? []).map((act) => ({
        kind: act.kind,
        rawSpan: act.rawSpan,
        polarity: act.polarity,
        actionVerb: act.actionVerb ?? null,
        objectText: act.objectText ?? null,
        subjectText: act.subjectText ?? null,
        temporalRaw: act.temporalRaw ?? null,
        temporalRelation: act.temporalRelation ?? null,
        condition: act.condition?.raw ?? null,
        dependency: act.dependency?.raw ?? null,
        corrections: (act.corrections ?? []).map((correction) => ({
          from: correction.from,
          to: correction.to,
          facet: correction.facet,
          order: correction.order,
        })),
        requiresClarification: act.requiresClarification ?? false,
        targetsExistingContext: act.targetsExistingContext ?? false,
      }));

      return {
        id: item.id,
        domain: item.domain,
        capability: item.capability,
        input: item.input,
        transcriptAfterSpeechPipeline: transcript,
        speech: {
          outcome: speech.outcome,
          interpretationConfidence: speech.confidence.interpretation,
          acts: speechActs,
        },
        typedEngine: typedEngine,
        transcriptEngine: transcriptEngine,
        engineFieldDifferences: differences(typedEngine, transcriptEngine),
        engineParity: differences(typedEngine, transcriptEngine).length === 0,
        speechActCount: speechActs.length,
        semanticShadow: semanticShadow ? {
          sameUtterance: semanticShadow.input.sameUtterance,
          summary: semanticShadow.summary,
          comparisons: semanticShadow.comparisons.map((comparison) => ({
            signal: comparison.signal,
            speech: comparison.speech.value,
            engine: comparison.engine.value,
            status: comparison.status,
          })),
        } : null,
      };
    });

    const report = {
      benchmark: 'phase-n-paired-semantic-replay-v1',
      purpose: 'diagnostic baseline only; no draft annotation is treated as gold truth',
      today: TODAY,
      caseCount: observations.length,
      domains: [...new Set(observations.map((row) => row.domain))].sort(),
      executionPaths: [
        'typed utterance -> engine semantic interpreter',
        'utterance -> deterministic speech pipeline -> capture-field transcript -> engine semantic interpreter',
        'utterance -> speech semantic acts + speech decision',
      ],
      limitations: [
        'Fixed text is used; acoustic speech-recognition accuracy is not measured.',
        'Engine field parity does not prove that either interpretation is correct.',
        'Speech act richness and engine task-oriented slots are different contracts; differences are diagnostic, not automatically failures.',
        'No task persistence or runtime policy is changed.',
      ],
      summary: {
        exactEngineProjectionParity: observations.filter((row) => row.engineParity).length,
        semanticShadow: {
          comparedCases: observations.filter((row) => row.semanticShadow !== null).length,
          sameUtteranceCases: observations.filter((row) => row.semanticShadow?.sameUtterance).length,
          bySignal: SHADOW_SIGNALS.map((signal) => {
            const comparisons = observations.flatMap((row) =>
              row.semanticShadow?.comparisons.filter((comparison) => comparison.signal === signal) ?? []
            );
            return {
              signal,
              agree: comparisons.filter((comparison) => comparison.status === 'agree').length,
              disagree: comparisons.filter((comparison) => comparison.status === 'disagree').length,
              notComparable: comparisons.filter((comparison) => comparison.status === 'not_comparable').length,
              differentInput: comparisons.filter((comparison) => comparison.status === 'different_input').length,
            };
          }),
        },
        engineProjectionDifferences: observations.filter((row) => !row.engineParity).map((row) => ({
          id: row.id,
          fields: row.engineFieldDifferences,
        })),
        noSpeechActs: observations.filter((row) => row.speechActCount === 0).map((row) => row.id),
        speechOutcomes: observations.reduce<Record<string, number>>((counts, row) => {
          counts[row.speech.outcome] = (counts[row.speech.outcome] ?? 0) + 1;
          return counts;
        }, {}),
      },
      observations,
    };

    console.info('\\nPHASE_N_PAIRED_SEMANTIC_REPLAY=' + JSON.stringify(report));

    // Validate harness integrity, not current product performance.
    expect(observations).toHaveLength(CASES.length);
    expect(new Set(observations.map((row) => row.id)).size).toBe(CASES.length);
    expect(report.domains.length).toBeGreaterThanOrEqual(8);
    expect(observations.every((row) => row.input.length > 0 && row.transcriptAfterSpeechPipeline.length > 0)).toBe(true);
    expect(observations.every((row) => Array.isArray(row.engineFieldDifferences) && Array.isArray(row.speech.acts))).toBe(true);
    expect(report.summary.semanticShadow.comparedCases).toBeGreaterThan(0);
    expect(report.summary.semanticShadow.bySignal).toHaveLength(SHADOW_SIGNALS.length);
    expect(observations.filter((row) => row.semanticShadow !== null).every((row) => {
      if (!row.semanticShadow) return false;
      const summary = row.semanticShadow.summary;
      return summary.agreements + summary.disagreements
        + summary.notComparable + summary.differentInput === SHADOW_SIGNALS.length;
    })).toBe(true);
  });
});
