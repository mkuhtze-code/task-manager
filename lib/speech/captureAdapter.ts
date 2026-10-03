/**
 * UI-facing speech capture adapter — the only seam Capture/Today should call.
 * Does not render UI. Does not open the mic. Does not write tasks.
 * Principle: understanding ≠ permission to act.
 */

import { processSpeechText } from './pipeline';
import { semanticOutcome, decisionWouldCreateTask, type SpeechDecision } from './decision';
import {
  observeConfirmedInterpretation,
  recordSpeechCorrection,
  createSpeechLearningEvent,
  confirmTranscriptRepairs,
} from './learning';
import type { SpeechUnderstandingContext } from './semantic/context';
import type { SemanticActionOutcome, SemanticAct } from './semantic/types';
import type {
  Confidence,
  PersonalLanguageModel,
  SpeechInterpretation,
  SpeechLearningEvent,
  SpeechPipelineResult,
} from './types';
import type { PersonalCommunicationProfile } from '@/lib/communication/types';

export type CaptureUiMode =
  | 'silent'
  | 'show_observation'
  | 'ask_clarification'
  | 'confirm_proposals'
  | 'confirm_update'
  | 'auto_safe_noop';

export type CaptureProposal = {
  actId: string;
  kind: SemanticAct['kind'];
  summary: string;
  actionVerb?: string;
  objectText?: string;
  temporalRaw?: string;
  temporalRelation?: string;
  entityLinks?: { entityId: string; label: string; kind: string }[];
  conditionRaw?: string;
  polarity: SemanticAct['polarity'];
  actionConfidence: Confidence;
  blocked: boolean;
  reason: string;
};

export type CaptureSpeechResult = {
  outcome: SemanticActionOutcome;
  uiMode: CaptureUiMode;
  surfaceSummary: string;
  rawText: string;
  normalisedText: string;
  proposals: CaptureProposal[];
  wouldMutateWithoutConfirm: boolean;
  mustNotCreateTask: boolean;
  requiresConfirmation: boolean;
  confidence: {
    transcription: Confidence;
    interpretation: Confidence;
    action: Confidence;
  };
  reasons: string[];
  evidenceTrail: string[];
  interpretationId: string;
  sessionId?: string;
  pipeline: SpeechPipelineResult;
  decision: SpeechDecision | null;
};

export type ProcessCaptureSpeechInput = {
  text: string;
  todayIso?: string;
  languageModel?: PersonalLanguageModel | null;
  understandingContext?: SpeechUnderstandingContext | null;
  profile?: PersonalCommunicationProfile | null;
  userId?: string;
};

function uiModeFrom(outcome: SemanticActionOutcome, d: SpeechDecision | null): CaptureUiMode {
  switch (outcome) {
    case 'CREATE_TASK':
    case 'CREATE_MULTIPLE_TASKS':
      return 'confirm_proposals';
    case 'UPDATE_EXISTING_CONTEXT':
      return 'confirm_update';
    case 'ASK_CLARIFICATION':
      return 'ask_clarification';
    case 'RECORD_OBSERVATION':
    case 'NOTE_REPORTED':
      return 'show_observation';
    case 'DO_NOT_CREATE':
    default:
      if (d?.reasons.some((r) => /must_not|negation|refusal|reported|thinking/i.test(r))) {
        return 'auto_safe_noop';
      }
      return 'silent';
  }
}

function proposalsFrom(
  d: SpeechDecision | null,
  interpretation: SpeechInterpretation | null
): CaptureProposal[] {
  if (!d) return [];
  const acts = interpretation?.semantic?.acts ?? [];
  const byId = new Map(acts.map((a) => [a.id, a]));

  return d.actDecisions
    .filter((ad) => ad.action === 'create_task' || ad.action === 'update_task' || ad.action === 'ask_user')
    .map((ad) => {
      const act = byId.get(ad.actId);
      return {
        actId: ad.actId,
        kind: ad.actKind,
        summary: ad.proposedSummary ?? act?.rawSpan?.slice(0, 100) ?? '',
        actionVerb: act?.actionVerb,
        objectText: act?.objectText,
        temporalRaw: act?.temporalRaw,
        temporalRelation: act?.temporalRelation,
        entityLinks: act?.entityLinks?.map((l) => ({
          entityId: l.entityId,
          label: l.label,
          kind: l.kind,
        })),
        conditionRaw: act?.condition?.raw,
        polarity: act?.polarity ?? 'unknown',
        actionConfidence: ad.actionConfidence,
        blocked: ad.blocked,
        reason: ad.reason,
      };
    });
}

export function processCaptureSpeech(input: ProcessCaptureSpeechInput): CaptureSpeechResult {
  const pipeline = processSpeechText(input.text, {
    todayIso: input.todayIso,
    languageModel: input.languageModel,
    understandingContext: input.understandingContext,
    profile: input.profile,
    session: input.userId
      ? {
          id: `cap-${Date.now()}`,
          userId: input.userId,
          status: 'transcribed',
          startedAt: new Date().toISOString(),
          transcriptionAttempts: 0,
        }
      : undefined,
  });

  const interpretation = pipeline.interpretation;
  const decision = pipeline.decision ?? null;
  const outcome = decision
    ? semanticOutcome(decision)
    : ('DO_NOT_CREATE' as SemanticActionOutcome);

  const proposals = proposalsFrom(decision, interpretation).filter((p) => {
    if (p.blocked && p.kind !== 'question') return false;
    if (
      outcome === 'DO_NOT_CREATE' ||
      outcome === 'RECORD_OBSERVATION' ||
      outcome === 'NOTE_REPORTED'
    ) {
      return false;
    }
    return true;
  });

  let finalOutcome = outcome;
  if (
    proposals.filter(
      (p) =>
        !p.blocked &&
        (p.reason === 'positive_action' || p.reason === 'targets_existing_context')
    ).length > 1
  ) {
    finalOutcome = 'CREATE_MULTIPLE_TASKS';
  }

  return {
    outcome: finalOutcome,
    uiMode: uiModeFrom(finalOutcome, decision),
    surfaceSummary: interpretation?.surfaceSummary ?? input.text.slice(0, 120),
    rawText: interpretation?.originalTranscript ?? input.text,
    normalisedText: interpretation?.normalisedText ?? input.text,
    proposals,
    wouldMutateWithoutConfirm: decision ? decisionWouldCreateTask(decision) : false,
    mustNotCreateTask: decision?.mustNotCreateTask ?? true,
    requiresConfirmation: decision?.requiresConfirmation ?? true,
    confidence: {
      transcription: decision?.transcriptionConfidence ?? 'medium',
      interpretation: decision?.interpretationConfidence ?? interpretation?.confidence ?? 'low',
      action: decision?.actionConfidence ?? 'low',
    },
    reasons: decision?.reasons ?? interpretation?.reasons ?? [],
    evidenceTrail: decision?.evidenceTrail ?? [],
    interpretationId: interpretation?.id ?? 'none',
    sessionId: pipeline.session.id,
    pipeline,
    decision,
  };
}

/**
 * Dock / explicit accept after speech.
 *
 * Learns:
 * - certainty / commitment phrase cues
 * - transcript repairs with explicit-confirm strength (not weak observation)
 *
 * Never learns from a rejected or must-not-create path alone.
 */
export function confirmCaptureSpeech(
  model: PersonalLanguageModel,
  result: CaptureSpeechResult
): { model: PersonalLanguageModel; event: SpeechLearningEvent } {
  const interpretation = result.pipeline.interpretation;
  if (!interpretation) {
    return {
      model,
      event: createSpeechLearningEvent({
        userId: model.userId,
        kind: 'interpretation_confirmed',
        inputText: result.rawText,
        confidence: 'low',
      }),
    };
  }

  let next = observeConfirmedInterpretation(model, interpretation);

  /*
   * Dock is explicit acceptance. Repair evidence gets the stronger
   * confirmTranscriptRepairs bump on top of the observation pass.
   */
  const repairs = interpretation.transcriptRepairs ?? [];
  if (repairs.length > 0) {
    next = confirmTranscriptRepairs(next, repairs);
  }

  const event = createSpeechLearningEvent({
    userId: model.userId,
    kind: 'interpretation_confirmed',
    inputText: result.rawText,
    originalInterpretation: result.surfaceSummary,
    confidence: result.confidence.interpretation,
    context: {
      outcome: result.outcome,
      interpretationId: result.interpretationId,
      proposalCount: result.proposals.length,
      repairCount: repairs.length,
    },
  });

  return { model: next, event };
}

export function rejectOrCorrectCaptureSpeech(
  model: PersonalLanguageModel,
  profile: PersonalCommunicationProfile,
  args: {
    result: CaptureSpeechResult;
    correctedSummary: string;
  }
): {
  model: PersonalLanguageModel;
  profile: PersonalCommunicationProfile;
  event: SpeechLearningEvent;
} {
  return recordSpeechCorrection(model, profile, {
    inputText: args.result.rawText,
    originalInterpretation: args.result.surfaceSummary,
    correctedInterpretation: args.correctedSummary,
    kind: 'interpretation_corrected',
  });
}

export function captureMustNotCreate(result: CaptureSpeechResult): boolean {
  return (
    result.mustNotCreateTask ||
    result.outcome === 'DO_NOT_CREATE' ||
    result.outcome === 'NOTE_REPORTED'
  );
}
