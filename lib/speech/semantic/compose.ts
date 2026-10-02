/**
 * Compose SemanticUtterance from normalised text + detector evidence.
 * Does not replace interpretSpeech — sits alongside and feeds safety.
 */

import type { NormalisationResult } from '../types';
import { extractActionClauses } from '../multiClause';
import { detectPolarity, isActionNegated } from './polarity';
import { buildCorrectionChain, isDiscourseActually } from './correctionChain';
import { applySafetyToUtterance, textLevelSafety } from './safety';
import {
  makeActId,
  type SemanticAct,
  type SemanticUtterance,
  type ActKind,
  type TemporalRelation,
} from './types';

const ACTION_VERB_RE =
  /\b(call|email|send|meet|message|text|create|schedule|order|book|invoice|quote|chase|check|inspect|finish|complete|mark|push|postpone|cancel|delete|update|note|remind)\b/i;

const REPORTED_RE = /\b([A-Z][a-z]+)\s+(?:said|says|told|tells)\b/;

function splitClauses(text: string): string[] {
  const multi = extractActionClauses(text);
  if (multi.length >= 2 && multi.every((c) => c.raw.trim())) {
    return multi.map((c) => c.raw.trim());
  }
  return text
    .split(/(?<=[.!?])\s+|\s+—\s+|\s+;\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifyClause(span: string): SemanticAct {
  const evidence: SemanticAct['evidence'] = [];
  const polarityHit = detectPolarity(span);
  let kind: ActKind = 'unknown';
  let blocksTaskCreation = false;
  let actionVerb: string | undefined;
  let sourceSpeaker: string | undefined;
  let confidence: SemanticAct['confidence'] = 'medium';

  if (/^\s*(?:do|does|did|can|could|should|would|what|when|where|who|why|how|is|are)\b/i.test(span) || /\?\s*$/.test(span)) {
    kind = 'question';
    blocksTaskCreation = true;
    evidence.push({ signal: 'question_form', source: 'compose' });
  } else if (REPORTED_RE.test(span)) {
    kind = 'reported_speech';
    const m = span.match(REPORTED_RE);
    sourceSpeaker = m?.[1];
    blocksTaskCreation = true;
    evidence.push({ signal: 'reported_speech', source: 'compose', span: sourceSpeaker });
  } else if (/\b(?:if|unless|when)\b/i.test(span) && ACTION_VERB_RE.test(span)) {
    kind = 'condition';
    blocksTaskCreation = true;
    evidence.push({ signal: 'conditional', source: 'compose' });
  } else if (
    /\b(?:don't\s+worry|no\s+need\s+anymore|forget\s+(?:that|it)|leave\s+it)\b/i.test(span)
  ) {
    kind = 'retraction';
    blocksTaskCreation = true;
    evidence.push({ signal: 'retraction', source: 'compose' });
  } else if (/\b(?:i\s+said\s+no|don't\s+want\s+to|nah,?\s+leave)\b/i.test(span)) {
    kind = 'refusal';
    blocksTaskCreation = true;
    evidence.push({ signal: 'refusal', source: 'compose' });
  } else if (
    /\b(?:hasn't|haven't|didn't|was\s+happy|still\s+hasn't|noticed)\b/i.test(span) &&
    !/\b(?:need\s+to|i(?:'ll| will))\b/i.test(span)
  ) {
    kind = 'observation';
    blocksTaskCreation = true;
    evidence.push({ signal: 'observation', source: 'compose' });
  } else if (ACTION_VERB_RE.test(span) || /\b(?:need\s+to|have\s+to|got\s+to)\b/i.test(span)) {
    kind = 'action';
    const vm = span.match(ACTION_VERB_RE);
    actionVerb = vm?.[1]?.toLowerCase();
    evidence.push({ signal: 'action_verb', source: 'compose', span: actionVerb });
    if (polarityHit.polarity === 'negated' || isActionNegated(span)) {
      blocksTaskCreation = true;
      evidence.push({ signal: 'negated_action', source: 'polarity' });
    }
  } else if (/^(?:yep|yes|yeah|ok|okay)\b/i.test(span.trim())) {
    kind = 'confirmation';
    blocksTaskCreation = true;
  }

  let objectText: string | undefined;
  if (actionVerb) {
    const after = span.split(new RegExp(`\\b${actionVerb}\\b`, 'i'))[1];
    if (after) {
      objectText = after.replace(/^(?:\s+me\s+to|\s+to|\s+)/i, '').trim().slice(0, 80);
    }
  }

  let temporalRelation: TemporalRelation = 'unknown';
  if (/\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/i.test(span)) {
    temporalRelation = 'by';
  } else if (/\buntil\b/i.test(span)) {
    temporalRelation = 'until';
  } else if (/\bbefore\b/i.test(span)) {
    temporalRelation = 'before';
  } else if (/\bafter\b/i.test(span)) {
    temporalRelation = 'after';
  } else if (/\bsometime\b/i.test(span)) {
    temporalRelation = 'sometime';
  } else if (/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i.test(span)) {
    temporalRelation = 'on';
  }

  if (isDiscourseActually(span) && kind === 'unknown') {
    evidence.push({ signal: 'discourse_actually', source: 'compose' });
  }

  if (kind === 'unknown') confidence = 'low';
  if (blocksTaskCreation) confidence = confidence === 'high' ? 'medium' : confidence;

  return {
    id: makeActId(),
    kind,
    rawSpan: span,
    polarity: polarityHit.polarity,
    actionVerb,
    objectText,
    sourceSpeaker,
    temporalRelation,
    evidence,
    confidence,
    blocksTaskCreation,
  };
}

export function composeSemanticUtterance(
  rawText: string,
  normalisation?: NormalisationResult
): SemanticUtterance {
  const normalisedText = normalisation?.normalisedText ?? rawText.trim();
  const clauses = splitClauses(normalisedText || rawText);
  const acts = (clauses.length ? clauses : [normalisedText || rawText]).map(classifyClause);

  const hasRetraction = acts.some((a) => a.kind === 'retraction');
  if (hasRetraction) {
    for (const a of acts) {
      if (a.kind === 'action') {
        a.blocksTaskCreation = true;
        a.evidence.push({ signal: 'retracted_by_later_clause', source: 'compose' });
      }
    }
  }

  const correctionChain = buildCorrectionChain(normalisation?.corrections ?? []);
  const pre = textLevelSafety(rawText);

  let u: SemanticUtterance = {
    rawText,
    normalisedText,
    acts,
    correctionChain,
    mustNotCreateTask: pre.mustNotCreateTask,
    requiresConfirmation: pre.requiresConfirmation,
    reasons: [...pre.reasons],
    confidence: acts.every((a) => a.confidence === 'high')
      ? 'high'
      : acts.some((a) => a.confidence === 'low')
        ? 'low'
        : 'medium',
  };

  u = applySafetyToUtterance(u);
  return u;
}

export function canProposeTask(u: SemanticUtterance): boolean {
  return !u.mustNotCreateTask && u.acts.some((a) => a.kind === 'action' && a.polarity !== 'negated');
}
