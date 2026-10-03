/**
 * Speech → structured communication signals.
 *
 * Deterministic. Semantic layer composes multi-act meaning and gates
 * false task creation. The communication engine provides learned,
 * user-specific language understanding; the semantic layer remains
 * authoritative for task-safety decisions.
 */

import {
  understand,
} from '@/lib/communication/understand';

import {
  defaultPersonalCommunicationProfile,
} from '@/lib/communication/types';

import type {
  PersonalCommunicationProfile,
  StatementType,
  Certainty as CommunicationCertainty,
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

function mapCommunicationCertainty(
  certainty: CommunicationCertainty
): SpeechCertainty {
  switch (certainty) {
    case 'CONFIRMED':
      return 'definite';

    case 'PROVISIONAL':
      return 'probable';

    case 'NEEDS_CHECK':
      return 'uncertain';

    case 'DECLINED':
      return 'uncertain';

    case 'UNKNOWN':
    default:
      return 'unknown';
  }
}

function deriveCommitmentStrength(
  statementType: StatementType,
  certainty: CommunicationCertainty,
  intent: SpeechIntent,
  hasClearAction: boolean
): CommitmentStrength {
  if (
    certainty === 'DECLINED' ||
    statementType === 'QUESTION' ||
    statementType === 'OBSERVATION'
  ) {
    return 'none';
  }

  if (
    statementType === 'COMMITMENT' &&
    certainty === 'CONFIRMED'
  ) {
    return 'strong';
  }

  if (
    statementType === 'REQUIREMENT' ||
    intent === 'remember' ||
    intent === 'schedule'
  ) {
    return certainty === 'CONFIRMED'
      ? 'strong'
      : 'moderate';
  }

  if (hasClearAction) {
    return certainty === 'CONFIRMED'
      ? 'moderate'
      : 'weak';
  }

  return 'none';
}

function deriveUrgency(
  text: string,
  semantic: SpeechInterpretation['semantic']
): UrgencySignal {
  const lower = text.toLowerCase();

  if (
    /\b(?:urgent|urgently|asap|immediately|right\s+away|right\s+now|today|first\s+thing|must\s+be\s+done)\b/i.test(
      lower
    )
  ) {
    return 'explicit';
  }

  if (
    semantic?.acts.some(
      (act) =>
        act.kind === 'action' &&
        act.temporalRelation === 'by'
    )
  ) {
    return 'implied';
  }

  return 'none';
}

function deriveConstraints(
  semantic: SpeechInterpretation['semantic']
): ConstraintSignal[] {
  if (!semantic) return [];

  const constraints = new Set<ConstraintSignal>();

  for (const act of semantic.acts) {
    if (act.condition) {
      constraints.add('dependency');
    }

    if (act.dependency) {
      constraints.add('dependency');
    }

    if (
      act.temporalRelation === 'before' ||
      act.temporalRelation === 'by' ||
      act.temporalRelation === 'until' ||
      act.temporalRelation === 'not_before'
    ) {
      constraints.add('time');
    }

    if (
      act.requiresClarification ||
      act.confidence === 'low'
    ) {
      constraints.add('uncertainty');
    }

    if (
      act.references?.some(
        (reference) => reference.requiresClarification
      )
    ) {
      constraints.add('person_dependency');
    }
  }

  return [...constraints];
}

function deriveEntities(
  semantic: SpeechInterpretation['semantic']
): EntityMention[] {
  if (!semantic) return [];

  const entities: EntityMention[] = [];
  const seen = new Set<string>();

  for (const act of semantic.acts) {
    for (const link of act.entityLinks ?? []) {
      const key = `${link.entityId}:${link.matchedSpan.toLowerCase()}`;

      if (seen.has(key)) continue;
      seen.add(key);

      entities.push({
        raw: link.matchedSpan,
        kind: link.kind,
        resolvedId: link.entityId,
        confidence: link.confidence,
        wasCorrected:
          act.corrections?.some(
            (correction) =>
              correction.facet === 'entity'
          ) ?? false,
      });
    }
  }

  return entities;
}

function deriveTemporalReferences(
  normalisation: ReturnType<typeof normaliseSpeech>,
  semantic: SpeechInterpretation['semantic']
): TemporalReference[] {
  const refs = [...(normalisation.temporals ?? [])];

  if (!semantic) return refs;

  const seen = new Set(
    refs.map(
      (ref) =>
        `${ref.raw.toLowerCase()}|${ref.resolvedDate ?? ''}|${ref.resolvedTime ?? ''}`
    )
  );

  for (const act of semantic.acts) {
    if (!act.temporalRaw) continue;

    const key = `${act.temporalRaw.toLowerCase()}|${
      act.temporalResolvedDate ?? ''
    }|`;

    if (seen.has(key)) continue;

    seen.add(key);

    refs.push({
      raw: act.temporalRaw,
      kind: act.temporalRelation
        ? act.temporalRelation === 'by'
          ? 'deadline'
          : act.temporalRelation === 'on'
            ? 'weekday'
            : 'unknown'
        : 'unknown',
      resolvedDate:
        act.temporalResolvedDate ?? null,
      resolvedTime: null,
      isCorrection:
        act.corrections?.some(
          (correction) =>
            correction.facet === 'date' ||
            correction.facet === 'time'
        ) ?? false,
      confidence: act.confidence,
    });
  }

  return refs;
}

export function interpretSpeech(
  rawText: string,
  opts?: InterpretSpeechOptions
): SpeechInterpretation {
  const options = opts ?? {};

  const originalText = rawText ?? '';

  const normalisation = normaliseSpeech(
    originalText,
    {
      todayIso: options.todayIso,
    }
  );

  const text =
    normalisation.normalisedText ||
    originalText.trim();

  const reasons: string[] = [];

  /*
   * -------------------------------------------------------------
   * 1. Surface intent
   * -------------------------------------------------------------
   *
   * This is deliberately only a first-pass signal.
   * Semantic interpretation and communication understanding can
   * subsequently refine or downgrade it.
   */

  let intent: SpeechIntent = 'unknown';

  for (const {
    re,
    intent: detectedIntent,
  } of INTENT_PATTERNS) {
    if (re.test(text)) {
      intent = detectedIntent;
      reasons.push(`intent:${detectedIntent}`);
      break;
    }
  }

  if (intent === 'unknown') {
    reasons.push('intent:unknown');
  }

  /*
   * -------------------------------------------------------------
   * 2. Personal communication understanding
   * -------------------------------------------------------------
   *
   * The default profile is defined in communication/types.ts.
   * It must not be duplicated in the speech layer.
   */

  const profile =
    options.profile ??
    defaultPersonalCommunicationProfile('anon');

  let derived: {
    statementType: StatementType;
    certainty: CommunicationCertainty;
    communicationConfidence: Confidence;
    requiresConfirmation: boolean;
    action: string | null;
    learnedMeaning: string | null;
  } = {
    statementType: 'UNKNOWN',
    certainty: 'UNKNOWN',
    communicationConfidence: 'low',
    requiresConfirmation: true,
    action: null,
    learnedMeaning: null,
  };

  try {
    const understood = understand(text, {
      profile,
      today: options.todayIso,
    });

    derived = {
      statementType:
        understood.statementType ?? 'UNKNOWN',

      certainty:
        understood.certainty ?? 'UNKNOWN',

      communicationConfidence:
        understood.confidence ?? 'low',

      requiresConfirmation:
        !!understood.requiresConfirmation,

      action:
        understood.action ?? null,

      learnedMeaning:
        understood.learnedMeaning ?? null,
    };

    if (
      derived.statementType !== 'UNKNOWN'
    ) {
      reasons.push(
        `statementType:${derived.statementType}`
      );
    }

    if (
      derived.certainty !== 'UNKNOWN'
    ) {
      reasons.push(
        `certainty:${derived.certainty}`
      );
    }

    if (
      derived.learnedMeaning
    ) {
      reasons.push(
        `learnedMeaning:${derived.learnedMeaning}`
      );
    }
  } catch {
    /*
     * Communication understanding is best-effort.
     *
     * The deterministic semantic layer below remains authoritative
     * for safety and task creation.
     */
    reasons.push(
      'communication:understanding_failed'
    );
  }

  /*
   * -------------------------------------------------------------
   * 3. Semantic interpretation
   * -------------------------------------------------------------
   *
   * Semantic interpretation receives the original transcript so
   * evidence can remain tied to what the user actually said.
   *
   * Normalised text is supplied separately where supported by the
   * context object.
   */

  const semanticContext =
    options.understandingContext
      ? {
          ...options.understandingContext,
        }
      : undefined;

  const semantic = composeSemanticUtterance(
    originalText,
    normalisation,
    semanticContext
  );

  /*
   * -------------------------------------------------------------
   * 4. Safety / intent reconciliation
   * -------------------------------------------------------------
   *
   * Semantic safety outranks shallow lexical intent.
   */

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

  /*
   * A semantic action is a stronger signal than the lexical
   * pattern matcher, provided the action is not negated or blocked.
   */

  const actionAct =
    semantic.acts.find(
      (act) =>
        act.kind === 'action' &&
        !act.blocksTaskCreation &&
        act.polarity !== 'negated'
    );

  const hasClearAction =
    !!actionAct ||
    semantic.acts.some(
      (act) =>
        act.kind === 'commitment' &&
        !act.blocksTaskCreation &&
        act.polarity !== 'negated'
    );

  /*
   * If the communication layer learned a direct action meaning,
   * use it to refine an otherwise weak lexical intent.
   */

  if (
    intent === 'unknown' &&
    derived.action
  ) {
    switch (
      derived.action.toLowerCase()
    ) {
      case 'postpone':
        intent = 'postpone';
        break;

      case 'complete':
      case 'resolve':
        intent = 'complete';
        break;

      case 'check':
      case 'investigate':
        intent = 'create';
        break;

      default:
        if (hasClearAction) {
          intent = 'create';
        }
        break;
    }

    if (intent !== 'unknown') {
      reasons.push(
        `intent:communication_refinement:${intent}`
      );
    }
  }

  /*
   * -------------------------------------------------------------
   * 5. Confidence
   * -------------------------------------------------------------
   */

  let confidence: Confidence =
    normalisation.confidence;

  const confidenceRank: Record<
    Confidence,
    number
  > = {
    low: 0,
    medium: 1,
    high: 2,
  };

  /*
   * Communication understanding is learned/user-specific evidence.
   * Semantic confidence is structural evidence.
   * We take the strongest reliable signal rather than blindly
   * replacing one with the other.
   */

  if (
    confidenceRank[
      derived.communicationConfidence
    ] >
    confidenceRank[confidence]
  ) {
    confidence =
      derived.communicationConfidence;

    reasons.push(
      'confidence:communication_evidence'
    );
  }

  if (
    semantic.confidence === 'high' &&
    confidence !== 'high'
  ) {
    confidence = 'high';

    reasons.push(
      'confidence:semantic_evidence'
    );
  } else if (
    semantic.confidence === 'medium' &&
    confidence === 'low'
  ) {
    confidence = 'medium';

    reasons.push(
      'confidence:semantic_evidence'
    );
  }

  if (intent === 'unknown') {
    confidence =
      confidence === 'high'
        ? 'medium'
        : 'low';

    reasons.push(
      'confidence:unknown_intent'
    );
  }

  /*
   * A clear positive action should not remain confidence-starved
   * simply because speech normalisation was conservative.
   */

  if (hasClearAction) {
    confidence =
      confidence === 'low'
        ? 'medium'
        : confidence;

    reasons.push(
      'confidence:boost_clear_action'
    );
  }

  /*
   * -------------------------------------------------------------
   * 6. Ambiguity
   * -------------------------------------------------------------
   */

  const ambiguity: AmbiguityLevel =
    intent === 'unknown' &&
    !hasClearAction
      ? 'high'
      : confidence === 'low'
        ? 'partial'
        : semantic.acts.some(
              (act) =>
                act.requiresClarification
            )
          ? 'partial'
          : 'none';

  if (ambiguity !== 'none') {
    reasons.push(
      `ambiguity:${ambiguity}`
    );
  }

  /*
   * -------------------------------------------------------------
   * 7. Statement type
   * -------------------------------------------------------------
   *
   * Prefer the communication engine's learned statement type.
   * Only fall back to speech/semantic inference when it has no
   * useful classification.
   */

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
              : semantic.acts.some(
                    (act) =>
                      act.kind ===
                        'commitment' &&
                      !act.blocksTaskCreation
                  )
                ? 'COMMITMENT'
                : hasClearAction
                  ? 'TASK'
                  : 'UNKNOWN';

  /*
   * -------------------------------------------------------------
   * 8. Derived communication signals
   * -------------------------------------------------------------
   */

  const certainty: SpeechCertainty =
    semantic.acts.find(
      (act) => act.certainty
    )?.certainty ??
    mapCommunicationCertainty(
      derived.certainty
    );

  const commitmentStrength =
    deriveCommitmentStrength(
      statementType,
      derived.certainty,
      intent,
      hasClearAction
    );

  const urgency = deriveUrgency(
    text,
    semantic
  );

  const constraints =
    deriveConstraints(semantic);

  const entities =
    deriveEntities(semantic);

  const temporalReferences =
    deriveTemporalReferences(
      normalisation,
      semantic
    );

  const corrections: CorrectionSpan[] =
    normalisation.corrections ?? [];

  /*
   * -------------------------------------------------------------
   * 9. Surface summary
   * -------------------------------------------------------------
   */

  const surfaceSummary =
    actionAct?.rawSpan?.slice(0, 120) ||
    actionAct?.objectText?.slice(0, 120) ||
    derived.action?.slice(0, 120) ||
    text.slice(0, 120);

  /*
   * -------------------------------------------------------------
   * 10. Confirmation / action gating
   * -------------------------------------------------------------
   *
   * This deliberately errs toward clarification when meaning is
   * genuinely uncertain, while allowing clear semantic actions
   * through without unnecessary friction.
   */

  const semanticCanProposeTask =
    canProposeTask(semantic);

  const requiresConfirmation =
    semantic.mustNotCreateTask ||
    !semanticCanProposeTask ||
    semantic.requiresConfirmation ||
    derived.requiresConfirmation ||
    ambiguity === 'high' ||
    (
      !hasClearAction &&
      confidence === 'low'
    ) ||
    (
      intent === 'unknown' &&
      !hasClearAction
    );

  /*
   * -------------------------------------------------------------
   * 11. Final interpretation
   * -------------------------------------------------------------
   */

  return {
    id: makeId(),

    transcriptId:
      options.transcriptId,

    sessionId:
      options.sessionId,

    originalTranscript:
      normalisation.originalText ||
      originalText,

    normalisedText:
      text,

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

    createdAt:
      new Date().toISOString(),
  };
}
