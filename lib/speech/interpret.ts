/**
 * Speech → structured communication signals.
 * Deterministic. Reuses communication.understand where helpful.
 * Semantic layer composes multi-act meaning and gates false tasks.
 * Optional understandingContext links entities from Dokkit state.
 */

import { understand } from '@/lib/communication/understand';
import type { PersonalCommunicationProfile, StatementType } from '@/lib/communication/types';
import { normaliseSpeech } from './normalise';
import { composeSemanticUtterance, canProposeTask } from './semantic';
import type {
  AmbiguityLevel,
  CommitmentStrength,
  ConstraintSignal,
  EntityMention,
  SpeechCertainty,
  SpeechIntent,
  SpeechInterpretation,
  TemporalReference,
  UrgencySignal,
  Confidence,
} from './types';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `si-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INTENT_PATTERNS: { re: RegExp; intent: SpeechIntent }[] = [
  { re: /\b(?:remind\s+me|remember\s+to|don'?t\s+forget|i\s+need\s+to\s+remember)\b/i, intent: 'remember' },
  { re: /\b(?:schedule|book|put\s+(?:it\s+)?on\s+(?:my\s+)?calendar)\b/i, intent: 'schedule' },
  { re: /\b(?:postpone|defer|push\s+(?:it\s+)?(?:out|back)|move\s+(?:it\s+)?to)\b/i, intent: 'postpone' },
  { re: /\b(?:cancel|scrub|drop\s+that)\b/i, intent: 'cancel' },
  { re: /\b(?:done|finished|complete(?:d)?|mark\s+(?:it\s+)?done)\b/i, intent: 'complete' },
  { re: /\b(?:create\s+(?:a\s+)?(?:job|task)|new\s+job|add\s+(?:a\s+)?task)\b/i, intent: 'create' },
  { re: /\b(?:call|email|text|message|meet|send|check|inspect|chase|quote|invoice|order|pick\s+up|follow\s+up)\b/i, intent: 'create' },
  { re: /\b(?:i\s+need\s+to|need\s+to|have\s+to|got\s+to|gotta)\b/i, intent: 'plan' },
  { re: /\b(?:can\s+you|could\s+you|what(?:'s|\s+is)|how\s+(?:do|does))\b/i, intent: 'ask' },
  { re: /\b(?:note|observe|noticed|saw\s+that)\b/i, intent: 'observe' },
];

export type InterpretSpeechOptions = {
  todayIso?: string;
  profile?: PersonalCommunicationProfile | null;
  languageModel?: import('./types').PersonalLanguageModel | null;
  understandingContext?: import('./semantic/types').SpeechUnderstandingContext | null;
};

export function interpretSpeech(
  rawText: string,
  opts?: InterpretSpeechOptions
): SpeechInterpretation {
  const normalisation = normaliseSpeech(rawText ?? '');
  const text = normalisation.normalisedText || (rawText ?? '').trim();
  const reasons: string[] = [];

  let intent: SpeechIntent = 'unknown';
  for (const { re, intent: i } of INTENT_PATTERNS) {
    if (re.test(text)) {
      intent = i;
      reasons.push(`intent:${i}`);
      break;
    }
  }
  if (intent === 'unknown') reasons.push('intent:unknown');

  const semantic = composeSemanticUtterance(rawText ?? '', normalisation, {
    todayIso: opts?.todayIso,
    understandingContext: opts?.understandingContext ?? undefined,
  });

  if (
    semantic.mustNotCreateTask &&
    (intent === 'create' || intent === 'plan' || intent === 'remember')
  ) {
    intent = 'observe';
    reasons.push('intent_downgraded_must_not_create');
  }

  let confidence: Confidence = normalisation.confidence;
  if (intent === 'unknown') confidence = confidence === 'high' ? 'medium' : 'low';
  if (semantic.acts.some((a) => a.kind === 'action' && !a.blocksTaskCreation)) {
    confidence = confidence === 'low' ? 'medium' : confidence;
  }

  const surfaceSummary =
    semantic.acts.find((a) => a.kind === 'action' && !a.blocksTaskCreation)?.rawSpan?.slice(0, 120) ||
    text.slice(0, 120);

  return {
    id: makeId(),
    originalTranscript: rawText ?? '',
    normalisedText: text,
    intent,
    commitmentStrength: 'unknown',
    urgency: 'none',
    constraints: [],
    certainty: 'unknown',
    entities: [],
    temporals: normalisation.temporals ?? [],
    ambiguity: intent === 'unknown' ? 'high' : 'low',
    surfaceSummary,
    confidence,
    reasons,
    requiresConfirmation: true,
    semantic,
    mustNotCreateTask: semantic.mustNotCreateTask,
    createdAt: new Date().toISOString(),
  };
}
