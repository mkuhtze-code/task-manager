import type {
  Certainty,
  Confidence,
  DerivedMeaning,
  PersonalCommunicationProfile,
  SpeakerRole,
  StatementType,
} from './types';
import { emptyDerivedMeaning } from './types';
import { findLearnedPhrases } from './learning';

export type UnderstandOptions = {
  today?: string;
  profile?: PersonalCommunicationProfile | null;
  speakerHint?: SpeakerRole;
};

export function understand(rawText: string, options: UnderstandOptions = {}): DerivedMeaning {
  const normalised = rawText.replace(/\s+/g, ' ').trim();
  if (!normalised) return emptyDerivedMeaning('');
  const lower = normalised.toLowerCase();
  const operators: string[] = [];
  const facets: DerivedMeaning['facets'] = {};
  let statementType: StatementType = 'UNKNOWN';
  let certainty: Certainty = 'UNKNOWN';
  let confidence: Confidence = 'low';
  let learnedMeaning: string | null = null;
  let action: string | null = null;

  if (options.profile) {
    const learned = findLearnedPhrases(options.profile, normalised);
    if (learned.length > 0) {
      const top = learned[0];
      learnedMeaning = top.meaning;
      if (top.statementTypeHint) statementType = top.statementTypeHint;
      confidence = top.source === 'explicit_correction' ? 'high' : 'medium';
      const ml = top.meaning.toLowerCase();
      if (ml === 'postpone' || ml === 'push out' || ml === 'defer') action = 'postpone';
      else if (ml === 'complete' || ml === 'resolve') action = 'complete';
      else if (ml === 'investigate' || ml === 'check') action = 'check';
    }
  }

  const hasNegation =
    /\b(?:don(?:'t|’t)|do\s+not|won(?:'t|’t)|can(?:'t|’t)|no\b|not\b|never|avoid)\b/.test(lower) ||
    /\bwe\s+don(?:'t|’t)\s+want\b/.test(lower);
  if (hasNegation) {
    operators.push('NEGATION');
    facets.negation = true;
  }

  if (/\b(?:i(?:'ll|'ll)?\s+need\s+to\s+check|need\s+to\s+check|let\s+me\s+check)\b/.test(lower)) {
    operators.push('UNCERTAINTY', 'DEFERRAL');
    certainty = 'NEEDS_CHECK';
  } else if (/\b(?:probably|possibly|maybe|perhaps|we\s+can\s+probably|i\s+think)\b/.test(lower)) {
    operators.push('UNCERTAINTY');
    certainty = 'PROVISIONAL';
  }

  const isQ =
    /\?\s*$/.test(normalised) ||
    /^(?:can|could|would|will|do|does|is|are|what|when|where|who|why|how)\b/.test(lower) ||
    /\b(?:can\s+you|could\s+you)\b/.test(lower);
  if (isQ) {
    operators.push('QUESTION');
    statementType = 'QUESTION';
  }

  const ans = lower.replace(/[.!]+$/, '').trim();
  if (/^(?:yes|yep|yeah|yup|sure|absolutely|ok|okay|alright|correct|agreed)\b/.test(ans)) {
    operators.push('ANSWER');
    if (statementType === 'UNKNOWN') statementType = 'ANSWER';
    if (certainty === 'UNKNOWN') {
      certainty = /\b(?:probably|maybe)\b/.test(ans) ? 'PROVISIONAL' : 'CONFIRMED';
    }
  } else if (/^(?:no|nope|nah)\b/.test(ans)) {
    operators.push('ANSWER', 'NEGATION');
    statementType = 'ANSWER';
    certainty = 'DECLINED';
  }

  if (
    /\b(?:i(?:'ll|'ll)\s+(?:do|get|sort|fix|check)|we(?:'ll|'ll)\s+(?:do|get|have|sort)|i\s+will\s+|we\s+will\s+)\b/.test(
      lower
    )
  ) {
    operators.push('COMMITMENT');
    if (statementType === 'UNKNOWN' || statementType === 'ANSWER') statementType = 'COMMITMENT';
    if (certainty === 'UNKNOWN' && !hasNegation && !operators.includes('UNCERTAINTY')) {
      certainty = 'CONFIRMED';
    }
  }

  if (/\b(?:we(?:'d|’d)?\s+(?:really\s+)?(?:like|prefer)|prefer(?:ably)?|ideally|as\s+close\s+to)\b/.test(lower)) {
    if (statementType === 'UNKNOWN') statementType = 'PREFERENCE';
  }
  if (/\b(?:we\s+need|i\s+need|must|have\s+to|required)\b/.test(lower)) {
    if (statementType === 'UNKNOWN' || statementType === 'PREFERENCE') statementType = 'REQUIREMENT';
  }
  if (hasNegation && /\b(?:want|like|prefer|avoid)\b/.test(lower)) {
    if (statementType === 'UNKNOWN' || statementType === 'PREFERENCE') statementType = 'CONSTRAINT';
  }
  if (/\b(?:can\s+you|could\s+you|please)\b/.test(lower) && statementType === 'UNKNOWN') {
    statementType = 'REQUEST';
  }

  if (!action) {
    const m = normalised.match(
      /\b(call|confirm|check|move|postpone|chuck|sort|fix|complete|order)\b/i
    );
    if (m) action = m[0].toLowerCase();
  }
  if (learnedMeaning) {
    const ml = learnedMeaning.toLowerCase();
    if (ml === 'postpone' || ml === 'push out') action = 'postpone';
  }

  if (statementType === 'UNKNOWN' && action && !isQ) statementType = 'TASK';

  if (!learnedMeaning) {
    let score = 0;
    if (statementType !== 'UNKNOWN') score += 1;
    if (certainty === 'CONFIRMED' || certainty === 'DECLINED') score += 2;
    if (certainty === 'PROVISIONAL' || certainty === 'NEEDS_CHECK') score += 1;
    confidence = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  }

  const requiresConfirmation =
    isQ ||
    operators.includes('UNCERTAINTY') ||
    certainty === 'NEEDS_CHECK' ||
    certainty === 'PROVISIONAL' ||
    certainty === 'UNKNOWN' ||
    confidence === 'low' ||
    statementType === 'CONSTRAINT' ||
    statementType === 'REQUIREMENT';

  return {
    ...emptyDerivedMeaning(normalised),
    statementType,
    certainty,
    confidence,
    operators: [...new Set(operators)],
    facets,
    action,
    learnedMeaning,
    requiresConfirmation,
  };
}
