/**
 * Speech → structured communication signals.
 * Deterministic. Semantic layer composes multi-act meaning and gates false tasks.
 */

import {
  understand,
  defaultPersonalCommunicationProfile,
} from '@/lib/communication/understand';
import type {
  PersonalCommunicationProfile,
  StatementType,
} from '@/lib/communication/types';
import { normaliseSpeech } from './normalise';
import {
  composeSemanticUtterance,
  canProposeTask,
} from './semantic';
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
  PersonalLanguageModel,
  CorrectionSpan,
} from './types';
import type { SpeechUnderstandingContext } from './semantic/context';

function makeId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `si-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

const INTENT_PATTERNS: {
  re: RegExp;
  intent: SpeechIntent;
}[] = [
  {
    re: /\b(?:remind\s+me|remember\s+to|don'?t\s+forget|i\s+need\s+to\s+remember)\b/i,
    intent: 'remember',
  },
  {
    re: /\b(?:schedule|book|put\s+(?:it\s+)?on\s+(?:my\s+)?calendar)\b/i,
    intent: 'schedule',
  },
  {
    re: /\b(?:postpone|defer|push\s+(?:it\s+)?(?:out|back)|move\s+(?:it\s+)?to)\b/i,
    intent: 'postpone',
  },
  {
    re: /\b(?:cancel|scrub|drop\s+that)\b/i,
    intent: 'cancel',
  },
  {
    re: /\b(?:done|finished|complete(?:d)?|mark\s+(?:it\s+)?done)\b/i,
    intent: 'complete',
  },
  {
    re: /\b(?:create\s+(?:a\s+)?(?:job|task)|new\s+job|add\s+(?:a\s+)?task)\b/i,
    intent: 'create',
  },
  {
    re: /\b(?:call|email|text|message|meet|send|check|inspect|chase|quote|invoice|order|pick\s+up|follow\s+up)\b/i,
    intent: 'create',
  },
  {
    re: /\b(?:i\s+need\s+to|need\s+to|have\s+to|got\s+to|gotta)\b/i,
    intent: 'plan',
  },
  {
    re: /\b(?:can\s+you|could\s+you|what(?:'s|\s+is)|how\s+(?:do|does))\b/i,
    intent: 'ask',
  },
  {
    re: /\b(?:note|observe|noticed|saw\s+that)\b/i,
    intent: 'observe',
  },
];

export type InterpretSpeechOptions = {
  todayIso?: string;
  profile?: PersonalCommunicationProfile | null;
  languageModel?: PersonalLanguageModel | null;
  understandingContext?: SpeechUnderstandingContext | null;
  transcriptId?: string;
  sessionId?: string;
};

export function interpretSpeech(
  rawText: string,
  opts?: InterpretSpeechOptions
): SpeechInterpretation {
  const options = opts ?? {};

  const normalisation = normaliseSpeech(rawText ?? '');
  const text =
    normalisation.normalisedText ||
    (rawText ?? '').trim();

  const reasons: string[] = [];

  let intent: SpeechIntent = 'unknown';

  for (const { re, intent: detectedIntent } of INTENT_PATTERNS) {
    if (re.test(text)) {
      intent = detectedIntent;
      reasons.push(`intent:${detectedIntent}`);
      break;
    }
  }

  if (intent === 'unknown') {
    reasons.push('intent:unknown');
  }

  const profile =
    options.profile ??
    defaultPersonalCommunicationProfile('anon');

  let derived: {
    statementType: StatementType;
    requiresConfirmation: boolean;
  } = {
    statementType: 'UNKNOWN',
    requiresConfirmation: false,
  };

  try {
    const understood = understand(text, {
      profile,
      today: options.todayIso,
    });

    derived = {
      statementType:
        understood.statementType ?? 'UNKNOWN',
      requiresConfirmation:
        !!understood.requiresConfirmation,
    };

    if (derived.statementType !== 'UNKNOWN') {
      reasons.push(
        `statementType:${derived.statementType}`
      );
    }
  } catch {
    // Communication understanding is best-effort.
    // Semantic interpretation below remains authoritative.
  }

  /*
   * composeSemanticUtterance accepts SpeechUnderstandingContext
   * directly as its third argument. It does not accept an options
   * object containing todayIso/understandingContext.
   */
  const semantic = composeSemanticUtterance(
    rawText ?? '',
    normalisation,
    options.understandingContext ?? undefined
  );

  if (
    semantic.mustNotCreateTask &&
    (
      intent === 'create' ||
      intent === 'plan' ||
      intent === 'remember' ||
      intent === 'schedule'
    )
  ) {
    if (
      semantic.acts.some(
        (act) => act.kind === 'question'
      )
    ) {
      intent = 'ask';
      reasons.push(
        'safety:intent_downgrade_question'
      );
    } else if (
      semantic.acts.some(
        (act) => act.kind === 'observation'
      )
    ) {
      intent = 'observe';
      reasons.push(
        'safety:intent_downgrade_observe'
      );
    } else if (
      semantic.acts.some(
        (act) =>
          act.kind === 'refusal' ||
          act.polarity === 'negated'
      )
    ) {
      intent = 'cancel';
      reasons.push(
        'safety:intent_downgrade_negation'
      );
    } else {
      intent = 'unknown';
      reasons.push(
        'safety:intent_blocked'
      );
    }
  }

  let confidence: Confidence =
    normalisation.confidence;

  if (intent === 'unknown') {
    confidence =
      confidence === 'high'
        ? 'medium'
        : 'low';
  }

  /*
   * A clear positive action should not remain confidence-starved
   * simply because the normaliser was conservative.
   */
  const hasClearAction =
    semantic.acts.some(
      (act) =>
        act.kind === 'action' &&
        !act.blocksTaskCreation &&
        act.polarity !== 'negated'
    );

  if (hasClearAction) {
    confidence =
      confidence === 'low'
        ? 'medium'
        : confidence;

    reasons.push(
      'confidence:boost_clear_action'
    );
  }

  const ambiguity: AmbiguityLevel =
    intent === 'unknown' &&
    !hasClearAction
      ? 'high'
      : confidence === 'low'
        ? 'partial'
        : 'none';

  if (ambiguity !== 'none') {
    reasons.push(
      `ambiguity:${ambiguity}`
    );
  }

  const statementType: StatementType =
    derived.statementType !== 'UNKNOWN'
      ? derived.statementType
      : intent === 'ask'
        ? 'QUESTION'
        : intent === 'complete'
          ? 'STATUS_CHANGE'
          : intent === 'observe'
            ? 'OBSERVATION'
            : (
                intent === 'create' ||
                intent === 'remember' ||
                intent === 'plan'
              )
              ? 'TASK'
              : hasClearAction
                ? 'TASK'
                : 'UNKNOWN';

  const actionAct =
    semantic.acts.find(
      (act) =>
        act.kind === 'action' &&
        !act.blocksTaskCreation &&
        act.polarity !== 'negated'
    );

  const surfaceSummary =
    actionAct?.rawSpan?.slice(0, 120) ||
    actionAct?.objectText ||
    text.slice(0, 120);

  const requiresConfirmation =
    ambiguity === 'high' ||
    (!hasClearAction &&
      confidence === 'low') ||
    (
      intent === 'unknown' &&
      !hasClearAction
    ) ||
    derived.requiresConfirmation ||
    semantic.requiresConfirmation ||
    semantic.mustNotCreateTask ||
    !canProposeTask(semantic);

  const entities: EntityMention[] = [];

  const constraints: ConstraintSignal[] = [];

  const certainty: SpeechCertainty = 'unknown';

  const commitmentStrength: CommitmentStrength =
    hasClearAction
      ? 'moderate'
      : 'none';

  const urgency: UrgencySignal = 'unknown';

  const temporalReferences: TemporalReference[] =
    normalisation.temporals ?? [];

  const corrections: CorrectionSpan[] =
    normalisation.corrections ?? [];

  return {
    id: makeId(),
    transcriptId: options.transcriptId,
    sessionId: options.sessionId,

    originalTranscript:
      normalisation.originalText ||
      (rawText ?? ''),

    normalisedText: text,

    intent,
    statementType,
    certainty,
    commitmentStrength,
    urgency,

    constraints,
    temporalReferences,
    entities,
    corrections,

    ambiguity,
    surfaceSummary,
    confidence,
    reasons,

    requiresConfirmation,

    semantic,
    mustNotCreateTask:
      semantic.mustNotCreateTask,

    createdAt: new Date().toISOString(),
  };
}