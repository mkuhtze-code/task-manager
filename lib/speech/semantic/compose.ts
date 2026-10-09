/**
 * Compose SemanticUtterance from normalised text + detector evidence.
 * Acts are the primary unit; modifiers attach per-act.
 * Optional Dokkit context enables entity linking without inventing entities.
 */

import type { NormalisationResult, TemporalReference } from '../types';
import { extractActionClauses } from '../multiClause';
import { detectPolarity, isActionNegated } from './polarity';
import { buildCorrectionChain, isDiscourseActually } from './correctionChain';
import { applyCorrectionsToClause } from './correctionsSemantic';
import { extractCondition, extractDependency, isActionWithCondition } from './conditions';
import { resolveReferencesInActs } from './references';
import type { SpeechUnderstandingContext } from './context';
import {
  resolveTemporalOverlaps,
  temporalForClause,
  relationFromTemporal,
} from './temporalSpans';
import { applySafetyToUtterance, textLevelSafety } from './safety';
import {
  applyDiscourseSupersession,
  reclassifyPastTenseObservations,
} from './discourse';
import {
  makeActId,
  type SemanticAct,
  type SemanticUtterance,
  type ActKind,
} from './types';

const ACTION_VERB_RE =
  /\b(call|email|send|meet|message|text|create|schedule|order|book|invoice|quote|chase|check|inspect|finish|complete|mark|push|postpone|cancel|delete|update|note|remind|tell|ask|pick|drop|collect|fetch|grab|deliver)\b/i;

const REPORTED_RE = /\b([A-Z][a-z]+)\s+(?:said|says|told|tells)\b/;

function splitClauses(text: string): string[] {
  const multi = extractActionClauses(text);
  if (multi.length >= 2 && multi.every((c) => c.raw.trim())) {
    // Reject multi results that still glue multiple sentences into one clause
    // Only reject if one clause still contains multiple sentence terminators
    const looksGlued = multi.some(
      (c) => (c.raw.match(/[.!?]/g) ?? []).length >= 2
    );
    if (!looksGlued) return multi.map((c) => c.raw.trim());
  }
  const parts = text
    .split(/(?<=[.!?])\s+|\s+—\s+|\s+;\s+|\s+\bbut\b\s+|\s+\band\s+(?=tell\b|ask\b)|\s*,\s*wait,?\s+|\s+\bOh,?\s+and\b\s+|\s+\bSo\s+(?:let'?s|lets)\b\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts;
  if (multi.length >= 2) return multi.map((c) => c.raw.trim());
  return text.trim() ? [text.trim()] : [];
}

function classifyClause(span: string, temporals: TemporalReference[]): SemanticAct {
  const evidence: SemanticAct['evidence'] = [];
  const { text: correctedSpan, steps: localCorrections } = applyCorrectionsToClause(span);
  const polarityHit = detectPolarity(correctedSpan);
  let kind: ActKind = 'unknown';
  let blocksTaskCreation = false;
  let actionVerb: string | undefined;
  let sourceSpeaker: string | undefined;
  let confidence: SemanticAct['confidence'] = 'medium';

  const hasActionVerb = ACTION_VERB_RE.test(correctedSpan);
  const condition = extractCondition(correctedSpan);
  const dependency = extractDependency(correctedSpan);

  if (
    /^\s*(?:do|does|did|can|could|should|would|what|when|where|who|why|how|is|are)\b/i.test(
      correctedSpan
    ) ||
    /\?\s*$/.test(correctedSpan)
  ) {
    kind = 'question';
    blocksTaskCreation = true;
    evidence.push({ signal: 'question_form', source: 'compose' });
  } else if (REPORTED_RE.test(correctedSpan)) {
    kind = 'reported_speech';
    const m = correctedSpan.match(REPORTED_RE);
    sourceSpeaker = m?.[1];
    blocksTaskCreation = true;
    evidence.push({ signal: 'reported_speech', source: 'compose', span: sourceSpeaker });
  } else if (
    /\b(?:don't\s+worry|no\s+need\s+anymore|forget\s+(?:that|it)|leave\s+it)\b/i.test(correctedSpan)
  ) {
    kind = 'retraction';
    blocksTaskCreation = true;
    evidence.push({ signal: 'retraction', source: 'compose' });
  } else if (/\b(?:i\s+said\s+no|don't\s+want\s+to|nah,?\s+leave)\b/i.test(correctedSpan)) {
    kind = 'refusal';
    blocksTaskCreation = true;
    evidence.push({ signal: 'refusal', source: 'compose' });
  } else if (
    /\b(?:hasn't|haven't|didn't|was\s+happy|still\s+hasn't|noticed)\b/i.test(correctedSpan) &&
    !/\b(?:need\s+to|i(?:'ll| will))\b/i.test(correctedSpan)
  ) {
    kind = 'observation';
    blocksTaskCreation = true;
    evidence.push({ signal: 'observation', source: 'compose' });
  } else if (
    /^\s*(?:maybe|perhaps|possibly|i(?:'m| am) wondering|i wonder|i think|not sure|unsure|hmm)\b/i.test(correctedSpan) &&
    !/\b(?:i\s+need\s+to|i\s+have\s+to|i(?:'ve| have)\s+got\s+to|i\s+must|remind\s+me\s+to|don't\s+forget\s+to)\b/i.test(correctedSpan)
  ) {
    // A speculative thought containing an action verb is not itself a task
    // commitment. Keep it as non-executable unless the speaker explicitly
    // commits to the action; do not let ACTION_VERB_RE override discourse.
    kind = 'unknown';
    blocksTaskCreation = true;
    evidence.push({ signal: 'thinking_aloud', source: 'compose' });
  } else if (hasActionVerb) {
    kind = 'action';
    const vm = correctedSpan.match(ACTION_VERB_RE);
    actionVerb = vm?.[1]?.toLowerCase();
    evidence.push({ signal: 'action_verb', source: 'compose', span: actionVerb });
    if (polarityHit.polarity === 'negated' || isActionNegated(correctedSpan)) {
      blocksTaskCreation = true;
      evidence.push({ signal: 'negated_action', source: 'polarity' });
    }
    if (condition && isActionWithCondition(correctedSpan, true)) {
      evidence.push({ signal: 'condition_attached', source: 'conditions', span: condition.raw });
      blocksTaskCreation = true;
      evidence.push({ signal: 'conditional_blocks_auto', source: 'conditions' });
    }
    if (dependency) {
      evidence.push({ signal: 'dependency_attached', source: 'conditions', span: dependency.raw });
    }
  } else if (condition && !hasActionVerb) {
    kind = 'condition';
    blocksTaskCreation = true;
    evidence.push({ signal: 'conditional', source: 'compose' });
  } else if (/^(?:yep|yes|yeah|ok|okay)\b/i.test(correctedSpan.trim())) {
    kind = 'confirmation';
    blocksTaskCreation = true;
  } else if (/\b(?:maybe|might|not\s+sure|wondering|hmm)\b/i.test(correctedSpan)) {
    kind = 'unknown';
    blocksTaskCreation = true;
    evidence.push({ signal: 'thinking_aloud', source: 'compose' });
  }

  let objectText: string | undefined;
  if (actionVerb) {
    const parts = correctedSpan.split(new RegExp(`\\b${actionVerb}\\b`, 'i'));
    const after = parts.slice(1).join(actionVerb);
    if (after) {
      objectText = after
        .replace(/^(?:\s+me\s+to\b|\s+)/i, '')
        .replace(/^\s*to\s+(?=(?:the|a|an)\b)/i, '')
        .replace(/\b(?:if|unless|when|after|before|once|until)\b[\s\S]*$/i, '')
        .replace(/^[,.\s]+/, '')
        .trim()
        .slice(0, 80);
    }
  }

  const temporal = temporalForClause(correctedSpan, temporals);
  const temporalRelation = relationFromTemporal(correctedSpan, temporal);
  if (temporal) {
    evidence.push({
      signal: `temporal:${temporal.kind}`,
      source: 'temporalSpans',
      span: temporal.raw,
    });
  }

  if (isDiscourseActually(correctedSpan) && kind === 'unknown') {
    evidence.push({ signal: 'discourse_actually', source: 'compose' });
  }

  for (const c of localCorrections) {
    evidence.push({
      signal: `correction:${c.facet}`,
      source: 'correctionsSemantic',
      span: `${c.from}→${c.to}`,
    });
  }

  if (kind === 'unknown' || blocksTaskCreation) confidence = 'low';
  if (localCorrections.length > 0 && kind === 'action' && !blocksTaskCreation) confidence = 'medium';

  return {
    id: makeActId(),
    kind,
    rawSpan: span,
    polarity: polarityHit.polarity,
    actionVerb,
    objectText,
    sourceSpeaker,
    temporalRaw: temporal?.raw,
    temporalRelation,
    temporalResolvedDate: temporal?.resolvedDate ?? null,
    condition,
    dependency,
    corrections: localCorrections.length ? localCorrections : undefined,
    evidence,
    confidence,
    blocksTaskCreation,
  };
}

export function composeSemanticUtterance(
  rawText: string,
  normalisation?: NormalisationResult,
  context?: SpeechUnderstandingContext | null
): SemanticUtterance {
  const normalisedText = normalisation?.normalisedText ?? rawText.trim();
  const rawTemporals = normalisation?.temporals ?? [];
  const temporals = resolveTemporalOverlaps(normalisedText || rawText, rawTemporals);

  const clauses = splitClauses(normalisedText || rawText);
  let acts = (clauses.length ? clauses : [normalisedText || rawText]).map((c) =>
    classifyClause(c, temporals)
  );

  if (acts.some((a) => a.kind === 'retraction')) {
    acts = acts.map((a) =>
      a.kind === 'action'
        ? {
            ...a,
            blocksTaskCreation: true,
            evidence: [...a.evidence, { signal: 'retracted_by_later_clause', source: 'compose' }],
          }
        : a
    );
  }

  acts = resolveReferencesInActs(acts, context);
  acts = reclassifyPastTenseObservations(acts);
  acts = applyDiscourseSupersession(acts);

  const fromNorm = buildCorrectionChain(normalisation?.corrections ?? []);
  const fromActs = acts.flatMap((a) => a.corrections ?? []);
  const correctionChain = [
    ...fromNorm,
    ...fromActs.map((c, i) => ({ ...c, order: fromNorm.length + i })),
  ];

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

  if (acts.some((a) => a.requiresClarification)) {
    u.requiresConfirmation = true;
    u.reasons = [...u.reasons, 'ambiguous_reference'];
  }

  u = applySafetyToUtterance(u);
  return u;
}

export function canProposeTask(u: SemanticUtterance): boolean {
  // Act-level only: a negated sibling must not suppress an independent positive act.
  return u.acts.some(
    (a) => a.kind === 'action' && a.polarity !== 'negated' && !a.blocksTaskCreation
  );
}

export function positiveActionActs(u: SemanticUtterance): SemanticAct[] {
  return u.acts.filter(
    (a) => a.kind === 'action' && a.polarity !== 'negated' && !a.blocksTaskCreation
  );
}
