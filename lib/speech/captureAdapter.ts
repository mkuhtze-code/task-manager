/**
 * UI-facing speech capture adapter — the only seam Capture/Today should call.
 * Does not render UI. Does not open the mic. Does not write tasks or collections.
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
import type { CollectionDetectContext } from '@/lib/collections';
import {
  detectCaptureCollection,
  type CaptureCollectionSummary,
} from './collectionBridge';

export type CaptureUiMode =
  | 'silent'
  | 'show_observation'
  | 'ask_clarification'
  | 'confirm_proposals'
  | 'confirm_update'
  | 'confirm_collection'
  | 'collection_clarification'
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
  /** Present when utterance matched a persistent-collection intent. */
  collection: CaptureCollectionSummary | null;
};

export type ProcessCaptureSpeechInput = {
  text: string;
  todayIso?: string;
  languageModel?: PersonalLanguageModel | null;
  understandingContext?: SpeechUnderstandingContext | null;
  profile?: PersonalCommunicationProfile | null;
  userId?: string;
  /** Active / known collections for resolution + implicit continuation. */
  collectionContext?: CollectionDetectContext | null;
};

function uiModeFrom(
  outcome: SemanticActionOutcome,
  d: SpeechDecision | null,
  collection: CaptureCollectionSummary | null
): CaptureUiMode {
  if (collection) {
    if (collection.intent.type === 'clarification_required') {
      return 'collection_clarification';
    }
    if (collection.intent.type === 'query_collection') {
      return 'show_observation';
    }
    if (collection.blocksTaskCreate) {
      return 'confirm_collection';
    }
  }
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
  let outcome = decision
    ? semanticOutcome(decision)
    : ('DO_NOT_CREATE' as SemanticActionOutcome);

  let proposals = proposalsFrom(decision, interpretation).filter((p) => {
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

  if (
    proposals.filter(
      (p) =>
        !p.blocked &&
        (p.reason === 'positive_action' || p.reason === 'targets_existing_context')
    ).length > 1
  ) {
    outcome = 'CREATE_MULTIPLE_TASKS';
  }

  // Persistent collection path — prefer normalised text; fall back to raw.
  const collectionText =
    interpretation?.normalisedText?.trim() ||
    input.text.trim();
  const collection = detectCaptureCollection(
    collectionText,
    input.collectionContext ?? null
  );

  let mustNotCreateTask = decision?.mustNotCreateTask ?? true;
  let requiresConfirmation = decision?.requiresConfirmation ?? true;
  let surfaceSummary = interpretation?.surfaceSummary ?? input.text.slice(0, 120);
  const reasons = [...(decision?.reasons ?? interpretation?.reasons ?? [])];
  const evidenceTrail = [...(decision?.evidenceTrail ?? [])];

  if (collection) {
    reasons.push(`collection:${collection.intent.type}`);
    evidenceTrail.push(`collectionIntent:${collection.intent.type}`);
    if (collection.blocksTaskCreate) {
      // Collection mutation supersedes task create for this utterance.
      mustNotCreateTask = true;
      requiresConfirmation = true;
      outcome = 'DO_NOT_CREATE';
      proposals = [];
      surfaceSummary = collection.surfaceMessage;
      if (collection.previewItems.length > 0) {
        surfaceSummary = `${collection.surfaceMessage}: ${collection.previewItems.slice(0, 4).join(', ')}`;
      }
    } else if (collection.intent.type === 'query_collection') {
      surfaceSummary = collection.surfaceMessage;
      evidenceTrail.push('collection:query');
    }
  }

  return {
    outcome,
    uiMode: uiModeFrom(outcome, decision, collection),
    surfaceSummary,
    rawText: interpretation?.originalTranscript ?? input.text,
    normalisedText: interpretation?.normalisedText ?? input.text,
    proposals,
    wouldMutateWithoutConfirm: false,
    mustNotCreateTask,
    requiresConfirmation,
    confidence: {
      transcription: decision?.transcriptionConfidence ?? 'medium',
      interpretation: decision?.interpretationConfidence ?? interpretation?.confidence ?? 'low',
      action: decision?.actionConfidence ?? 'low',
    },
    reasons,
    evidenceTrail,
    interpretationId: interpretation?.id ?? 'none',
    sessionId: pipeline.session.id,
    pipeline,
    decision,
    collection,
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
 * Collection mutations are applied by the UI via applyCollectionIntent — not here.
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
      collectionIntent: result.collection?.intent.type ?? null,
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

/** True when capture should route to collection confirm, not task Dock-as-task. */
export function captureIsCollectionMutation(result: CaptureSpeechResult): boolean {
  return (
    !!result.collection &&
    result.collection.blocksTaskCreate &&
    result.collection.intent.type !== 'query_collection'
  );
}

export type { CaptureCollectionSummary };
