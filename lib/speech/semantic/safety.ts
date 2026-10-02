/**
 * Safe action gate — before anything becomes a Dokkit task.
 * Wrong confident interpretation is worse than asking.
 */

import type { SemanticAct, SemanticUtterance } from './types';
import { detectPolarity, isActionNegated } from './polarity';

export type SafetyVerdict = {
  mustNotCreateTask: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
};

const QUESTION_RE =
  /^(?:do|does|did|can|could|should|would|will|what|when|where|who|why|how|is|are|am)\b/i;

const OBSERVATION_RE =
  /\b(?:hasn't|hasn't|haven't|didn't|was|were|still\s+hasn't|was\s+happy|noticed|saw\s+that)\b/i;

const CONFIRMATION_RE = /^(?:yep|yes|yeah|nah|nope|ok|okay|leave\s+it)\b/i;

export function textLevelSafety(text: string): SafetyVerdict {
  const reasons: string[] = [];
  let mustNotCreateTask = false;
  let requiresConfirmation = false;

  if (!text.trim()) {
    return {
      mustNotCreateTask: true,
      requiresConfirmation: true,
      reasons: ['empty'],
    };
  }

  if (QUESTION_RE.test(text.trim()) || /\?\s*$/.test(text)) {
    mustNotCreateTask = true;
    requiresConfirmation = true;
    reasons.push('question');
  }

  if (isActionNegated(text) || detectPolarity(text).polarity === 'negated') {
    if (
      isActionNegated(text) ||
      /\bno\s+need\b/i.test(text) ||
      /\bdon't\s+need\b/i.test(text) ||
      /\bi\s+said\s+no\b/i.test(text)
    ) {
      mustNotCreateTask = true;
      reasons.push('negation_or_refusal');
    }
  }

  if (/\b(?:said|says|told|tells)\b/i.test(text) && /\b(?:he|she|they|john|sarah|client)\b/i.test(text)) {
    requiresConfirmation = true;
    reasons.push('possible_reported_speech');
  }

  if (OBSERVATION_RE.test(text) && !/\b(?:need\s+to|i(?:'ll| will)|remind)\b/i.test(text)) {
    mustNotCreateTask = true;
    reasons.push('observation_like');
  }

  if (CONFIRMATION_RE.test(text.trim())) {
    mustNotCreateTask = true;
    reasons.push('confirmation_or_decline');
  }

  if (/\b(?:maybe|might|not\s+sure|unsure|probably)\b/i.test(text)) {
    requiresConfirmation = true;
    reasons.push('uncertain_language');
  }

  if (
    /\b(?:call|email|send|book|order|chase)\b/i.test(text) &&
    /\b(?:him|her|them|it|that)\b/i.test(text) &&
    !/\b(?:john|sarah|mike|henderson)\b/i.test(text)
  ) {
    requiresConfirmation = true;
    reasons.push('unresolved_reference');
  }

  return { mustNotCreateTask, requiresConfirmation, reasons };
}

export function actsLevelSafety(acts: SemanticAct[]): SafetyVerdict {
  const reasons: string[] = [];
  let mustNotCreateTask = false;
  let requiresConfirmation = false;

  for (const act of acts) {
    if (act.blocksTaskCreation) {
      mustNotCreateTask = true;
      reasons.push(`act_blocks:${act.kind}`);
    }
    if (act.polarity === 'negated' && act.kind === 'action') {
      mustNotCreateTask = true;
      reasons.push('negated_action');
    }
    if (act.kind === 'question' || act.kind === 'observation' || act.kind === 'refusal') {
      mustNotCreateTask = true;
      reasons.push(`kind:${act.kind}`);
    }
    if (act.kind === 'reported_speech') {
      requiresConfirmation = true;
      reasons.push('reported_speech');
    }
    if (act.kind === 'condition') {
      requiresConfirmation = true;
      reasons.push('conditional');
    }
    if (act.confidence === 'low') {
      requiresConfirmation = true;
      reasons.push('low_confidence_act');
    }
  }

  const actionable = acts.filter(
    (a) => a.kind === 'action' && a.polarity !== 'negated' && !a.blocksTaskCreation
  );
  if (actionable.length === 0) {
    mustNotCreateTask = true;
    reasons.push('no_positive_action');
  }
  if (actionable.length > 1) {
    requiresConfirmation = true;
    reasons.push('multiple_actions');
  }

  return { mustNotCreateTask, requiresConfirmation, reasons };
}

export function mergeSafety(...verdicts: SafetyVerdict[]): SafetyVerdict {
  const reasons = new Set<string>();
  let mustNotCreateTask = false;
  let requiresConfirmation = false;
  for (const v of verdicts) {
    if (v.mustNotCreateTask) mustNotCreateTask = true;
    if (v.requiresConfirmation) requiresConfirmation = true;
    v.reasons.forEach((r) => reasons.add(r));
  }
  return {
    mustNotCreateTask,
    requiresConfirmation: mustNotCreateTask || requiresConfirmation,
    reasons: [...reasons],
  };
}

export function applySafetyToUtterance(u: SemanticUtterance): SemanticUtterance {
  const merged = mergeSafety(
    textLevelSafety(u.rawText),
    textLevelSafety(u.normalisedText),
    actsLevelSafety(u.acts)
  );
  return {
    ...u,
    mustNotCreateTask: merged.mustNotCreateTask || u.mustNotCreateTask,
    requiresConfirmation: merged.requiresConfirmation || u.requiresConfirmation,
    reasons: [...new Set([...u.reasons, ...merged.reasons])],
  };
}
