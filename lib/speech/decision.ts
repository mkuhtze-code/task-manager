/**
 * Act-level action decisions.
 * Understanding ≠ permission to act.
 */

import type { Confidence, SpeechInterpretation } from './types';
import type { SemanticAct, SemanticUtterance, SemanticActionOutcome } from './semantic/types';
import { canProposeTask } from './semantic';

export type ActionKind =
  | 'create_task'
  | 'update_task'
  | 'schedule'
  | 'cancel'
  | 'complete'
  | 'ask_user'
  | 'record_observation'
  | 'note_reported'
  | 'learn_only'
  | 'noop';

export type ActDecision = {
  actId: string;
  actKind: SemanticAct['kind'];
  action: ActionKind;
  actionConfidence: Confidence;
  reason: string;
  proposedSummary?: string;
  blocked: boolean;
};

export type SpeechDecision = {
  interpretationId: string;
  rawText: string;
  normalisedText: string;
  transcriptionConfidence: Confidence;
  interpretationConfidence: Confidence;
  actionConfidence: Confidence;
  actDecisions: ActDecision[];
  wouldMutateWithoutConfirm: boolean;
  primaryAction: ActionKind;
  requiresConfirmation: boolean;
  mustNotCreateTask: boolean;
  reasons: string[];
  evidenceTrail: string[];
};

function minConfidence(a: Confidence, b: Confidence): Confidence {
  const order: Confidence[] = ['low', 'medium', 'high'];
  return order[Math.min(order.indexOf(a), order.indexOf(b))] ?? 'low';
}

function decideAct(act: SemanticAct): ActDecision {
  const base: Omit<ActDecision, 'action' | 'reason' | 'blocked' | 'actionConfidence'> = {
    actId: act.id,
    actKind: act.kind,
    proposedSummary: act.objectText
      ? `${act.actionVerb ?? act.kind} ${act.objectText}`.trim()
      : act.rawSpan.slice(0, 100),
  };

  if (act.blocksTaskCreation || act.polarity === 'negated') {
    if (act.kind === 'question') {
      return { ...base, action: 'ask_user', actionConfidence: 'high', reason: 'question_not_task', blocked: true };
    }
    if (act.kind === 'observation' || act.kind === 'reported_speech') {
      return {
        ...base,
        action: act.kind === 'reported_speech' ? 'note_reported' : 'record_observation',
        actionConfidence: 'medium',
        reason: `${act.kind}_not_user_commitment`,
        blocked: true,
      };
    }
    if (act.kind === 'refusal' || act.kind === 'retraction' || act.polarity === 'negated') {
      return { ...base, action: 'noop', actionConfidence: 'high', reason: 'negation_or_refusal', blocked: true };
    }
    if (act.kind === 'condition') {
      return { ...base, action: 'ask_user', actionConfidence: 'medium', reason: 'conditional_requires_confirm', blocked: true };
    }
    if (act.requiresClarification) {
      return { ...base, action: 'ask_user', actionConfidence: 'medium', reason: 'ambiguous_reference', blocked: true };
    }
    return { ...base, action: 'noop', actionConfidence: 'medium', reason: 'blocked_by_safety', blocked: true };
  }

  if (act.requiresClarification) {
    return { ...base, action: 'ask_user', actionConfidence: 'low', reason: 'ambiguous_reference', blocked: true };
  }

  if (act.targetsExistingContext) {
    return {
      ...base,
      action: 'update_task',
      actionConfidence: act.confidence === 'high' ? 'medium' : 'low',
      reason: 'targets_existing_context',
      blocked: false,
    };
  }

  if (act.kind === 'action') {
    const conf: Confidence =
      act.confidence === 'high' ? 'medium' : act.confidence === 'medium' ? 'medium' : 'low';
    return { ...base, action: 'create_task', actionConfidence: conf, reason: 'positive_action', blocked: false };
  }

  if (act.kind === 'commitment') {
    return { ...base, action: 'create_task', actionConfidence: 'medium', reason: 'commitment_signal', blocked: false };
  }

  if (act.kind === 'confirmation') {
    return { ...base, action: 'learn_only', actionConfidence: 'high', reason: 'confirmation_phrase', blocked: true };
  }

  return { ...base, action: 'ask_user', actionConfidence: 'low', reason: 'unknown_act', blocked: true };
}

export function decideSpeechActions(
  interpretation: SpeechInterpretation,
  opts?: { transcriptionConfidence?: Confidence }
): SpeechDecision {
  const semantic: SemanticUtterance | undefined = interpretation.semantic;
  const transcriptionConfidence = opts?.transcriptionConfidence ?? 'medium';
  const interpretationConfidence = interpretation.confidence;

  const acts = semantic?.acts ?? [];
  const actDecisions =
    acts.length > 0
      ? acts.map(decideAct)
      : [
          {
            actId: 'fallback',
            actKind: 'unknown' as const,
            action: (interpretation.mustNotCreateTask
              ? 'noop'
              : interpretation.intent === 'create' ||
                  interpretation.intent === 'plan' ||
                  interpretation.intent === 'remember'
                ? 'create_task'
                : interpretation.intent === 'ask'
                  ? 'ask_user'
                  : 'noop') as ActionKind,
            actionConfidence: interpretation.mustNotCreateTask
              ? ('high' as Confidence)
              : interpretationConfidence,
            reason: interpretation.mustNotCreateTask ? 'must_not_create_task' : 'legacy_intent',
            proposedSummary: interpretation.surfaceSummary,
            blocked: !!interpretation.mustNotCreateTask,
          },
        ];

  const positive = actDecisions.filter((d) => !d.blocked && d.action === 'create_task');
  const updatesOnly = actDecisions.filter((d) => !d.blocked && d.action === 'update_task');
  // Utterance-level mustNotCreateTask must not suppress independent positive acts.
  const mustNot =
    positive.length === 0 &&
    updatesOnly.length === 0 &&
    (interpretation.mustNotCreateTask === true ||
      (semantic ? !canProposeTask(semantic) : true));

  let primaryAction: ActionKind = 'noop';
  if (mustNot) {
    const ask = actDecisions.find((d) => d.action === 'ask_user');
    const obs = actDecisions.find(
      (d) => d.action === 'record_observation' || d.action === 'note_reported'
    );
    primaryAction = ask ? 'ask_user' : obs ? obs.action : 'noop';
  } else if (positive.length === 1) {
    primaryAction = 'create_task';
  } else if (positive.length > 1) {
    primaryAction = 'ask_user';
  } else {
    if (updatesOnly.length === 1) primaryAction = 'update_task';
    else if (updatesOnly.length > 1) primaryAction = 'ask_user';
  }

  const actionConfidence: Confidence = mustNot
    ? 'high'
    : [...positive, ...updatesOnly].reduce(
        (acc, d) => minConfidence(acc, d.actionConfidence),
        'high' as Confidence
      );

  const requiresConfirmation =
    interpretation.requiresConfirmation ||
    mustNot ||
    primaryAction === 'ask_user' ||
    positive.length > 1 ||
    actionConfidence === 'low' ||
    interpretationConfidence === 'low' ||
    acts.some((a) => a.requiresClarification);

  const evidenceTrail: string[] = [
    `raw:${interpretation.originalTranscript.slice(0, 120)}`,
    `normalised:${interpretation.normalisedText.slice(0, 120)}`,
    `transcriptionConfidence:${transcriptionConfidence}`,
    `interpretationConfidence:${interpretationConfidence}`,
    `actionConfidence:${actionConfidence}`,
    `acts:${acts.map((a) => a.kind).join(',') || 'none'}`,
    ...actDecisions.map((d) => `decision:${d.actKind}→${d.action}(${d.reason})`),
    ...(interpretation.reasons ?? []).slice(0, 12).map((r) => `signal:${r}`),
  ];

  return {
    interpretationId: interpretation.id,
    rawText: interpretation.originalTranscript,
    normalisedText: interpretation.normalisedText,
    transcriptionConfidence,
    interpretationConfidence,
    actionConfidence,
    actDecisions,
    wouldMutateWithoutConfirm: !requiresConfirmation && primaryAction === 'create_task',
    primaryAction,
    requiresConfirmation,
    mustNotCreateTask: mustNot,
    reasons: [
      ...new Set([
        ...(interpretation.reasons ?? []),
        ...actDecisions.map((d) => d.reason),
        mustNot ? 'must_not_create_task' : 'may_propose_task',
      ]),
    ],
    evidenceTrail,
  };
}

export function decisionWouldCreateTask(d: SpeechDecision): boolean {
  if (d.mustNotCreateTask) return false;
  if (d.requiresConfirmation) return false;
  return (
    d.primaryAction === 'create_task' &&
    d.actDecisions.some((a) => a.action === 'create_task' && !a.blocked)
  );
}

export function semanticOutcome(d: SpeechDecision): SemanticActionOutcome {
  if (d.mustNotCreateTask || d.primaryAction === 'noop') {
    if (d.primaryAction === 'ask_user') return 'ASK_CLARIFICATION';
    if (d.primaryAction === 'record_observation') return 'RECORD_OBSERVATION';
    if (d.primaryAction === 'note_reported') return 'NOTE_REPORTED';
    return 'DO_NOT_CREATE';
  }
  if (d.primaryAction === 'ask_user') return 'ASK_CLARIFICATION';
  const creates = d.actDecisions.filter((a) => a.action === 'create_task' && !a.blocked);
  if (creates.length > 1) return 'CREATE_MULTIPLE_TASKS';
  const updates = d.actDecisions.filter((a) => a.action === 'update_task' && !a.blocked);
  if (updates.length >= 1 && creates.length === 0) {
    return d.requiresConfirmation ? 'ASK_CLARIFICATION' : 'UPDATE_EXISTING_CONTEXT';
  }
  if (creates.length === 1) {
    return d.requiresConfirmation ? 'ASK_CLARIFICATION' : 'CREATE_TASK';
  }
  return 'DO_NOT_CREATE';
}
