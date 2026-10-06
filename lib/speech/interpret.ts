/**
 * Speech → structured communication signals.
 *
 * Deterministic. Semantic layer composes multi-act meaning and gates
 * false task creation. The communication engine provides learned,
 * user-specific language understanding; the semantic layer remains
 * authoritative for task-safety decisions.
 */

import { understand } from '@/lib/communication/understand';

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
  TranscriptRepair,
} from './types';

import type {
  SpeechUnderstandingContext,
} from './semantic/context';

type SpeechNormalisation =
  ReturnType<typeof normaliseSpeech>;

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

  profile?:
    | PersonalCommunicationProfile
    | null;

  languageModel?:
    | PersonalLanguageModel
    | null;

  normalisation?: SpeechNormalisation;

  understandingContext?:
    | SpeechUnderstandingContext
    | null;

  transcriptRepairs?: TranscriptRepair[];

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
  const lower =
    text.toLowerCase();

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

  const constraints =
    new Set<ConstraintSignal>();

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
        (reference) =>
          reference.requiresClarification
      )
    ) {
      constraints.add(
        'person_dependency'
      );
    }
  }

  return [...constraints];
}

function mapEntityKind(
  kind: string
): EntityMention['kind'] {
  switch (kind) {
    case 'person':
      return 'person';

    case 'job':
      return 'job';

    case 'place':
      return 'place';

    case 'task':
    case 'meeting':
    case 'quote':
    case 'thing':
    default:
      return 'thing';
  }
}

function deriveEntities(
  semantic: SpeechInterpretation['semantic']
): EntityMention[] {
  if (!semantic) return [];

  const entities: EntityMention[] = [];
  const seen =
    new Set<string>();

  for (const act of semantic.acts) {
    for (const link of act.entityLinks ?? []) {
      const key =
        `${link.entityId}:${link.matchedSpan.toLowerCase()}`;

      if (seen.has(key)) continue;

      seen.add(key);

      entities.push({
        raw: link.matchedSpan,
        kind: mapEntityKind(
          link.kind
        ),
        resolvedId:
          link.entityId,
        confidence:
          link.confidence,
        wasCorrected:
          act.corrections?.some(
            (correction) =>
              correction.facet ===
              'entity'
          ) ?? false,
      });
    }
  }

  return entities;
}

function deriveTemporalReferences(
  normalisation: SpeechNormalisation,
  semantic: SpeechInterpretation['semantic']
): TemporalReference[] {
  const refs = [
    ...(normalisation.temporals ?? []),
  ];

  if (!semantic) return refs;

  const seen =
    new Set(
      refs.map(
        (ref) =>
          `${ref.raw.toLowerCase()}|${ref.resolvedDate ?? ''}|${ref.resolvedTime ?? ''}`
      )
    );

  for (const act of semantic.acts) {
    if (!act.temporalRaw) continue;

    const key =
      `${act.temporalRaw.toLowerCase()}|${
        act.temporalResolvedDate ?? ''
      }|`;

    if (seen.has(key)) continue;

    seen.add(key);

    refs.push({
      raw: act.temporalRaw,

      kind:
        act.temporalRelation
          ? act.temporalRelation === 'by'
            ? 'deadline'
            : act.temporalRelation === 'on'
              ? 'weekday'
              : 'unknown'
          : 'unknown',

      resolvedDate:
        act.temporalResolvedDate ??
        null,

      resolvedTime: null,

      isCorrection:
        act.corrections?.some(
          (correction) =>
            correction.facet ===
              'date' ||
            correction.facet ===
              'time'
        ) ?? false,

      confidence:
        act.confidence,
    });
  }

  return refs;
}

export function interpretSpeech(
  rawText: string,
  opts?: InterpretSpeechOptions
): SpeechInterpretation {
  const options =
    opts ?? {};

  const originalText =
    rawText ?? '';

  const normalisation =
    options.normalisation ??
    normaliseSpeech(
      originalText,
      {
        todayIso:
          options.todayIso,
      }
    );

  const text =
    normalisation.normalisedText ||
    originalText.trim();

  const reasons: string[] = [];

  /*
   * Transcript repair is deliberately evidence-bearing.
   * It does not silently disappear after preprocessing.
   */
  if (
    options.transcriptRepairs?.length
  ) {
    for (
      const repair of
        options.transcriptRepairs
    ) {
      reasons.push(
        `transcriptRepair:${repair.original}→${repair.replacement}`
      );
    }
  }

  let intent: SpeechIntent =
    'unknown';

  for (
    const {
      re,
      intent:
        detectedIntent,
    } of INTENT_PATTERNS
  ) {
    if (re.test(text)) {
      intent =
        detectedIntent;

      reasons.push(
        `intent:${detectedIntent}`
      );

      break;
    }
  }

  if (
    intent === 'unknown'
  ) {
    reasons.push(
      'intent:unknown'
    );
  }

  const profile =
    options.profile ??
    defaultPersonalCommunicationProfile(
      'anon'
    );

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
    communicationConfidence:
      'low',
    requiresConfirmation: true,
    action: null,
    learnedMeaning: null,
  };

  try {
    const understood =
      understand(
        text,
        {
          profile,
          today:
            options.todayIso,
        }
      );

    derived = {
      statementType:
        understood.statementType ??
        'UNKNOWN',

      certainty:
        understood.certainty ??
        'UNKNOWN',

      communicationConfidence:
        understood.confidence ??
        'low',

      requiresConfirmation:
        !!understood.requiresConfirmation,

      action:
        understood.action ??
        null,

      learnedMeaning:
        understood.learnedMeaning ??
        null,
    };

    if (
      derived.statementType !==
      'UNKNOWN'
    ) {
      reasons.push(
        `statementType:${derived.statementType}`
      );
    }

    if (
      derived.certainty !==
      'UNKNOWN'
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
    reasons.push(
      'communication:understanding_failed'
    );
  }

  const semanticContext =
    options.understandingContext
      ? {
          ...options.understandingContext,
        }
      : undefined;

  const semantic =
    composeSemanticUtterance(
      originalText,
      normalisation,
      semanticContext
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
        (act) =>
          act.kind ===
          'question'
      )
    ) {
      intent = 'ask';

      reasons.push(
        'safety:intent_downgrade_question'
      );
    } else if (
      semantic.acts.some(
        (act) =>
          act.kind ===
          'observation'
      )
    ) {
      intent = 'observe';

      reasons.push(
        'safety:intent_downgrade_observe'
      );
    } else if (
      semantic.acts.some(
        (act) =>
          act.kind ===
            'refusal' ||
          act.polarity ===
            'negated'
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

  const actionAct =
    semantic.acts.find(
      (act) =>
        act.kind ===
          'action' &&
        !act.blocksTaskCreation &&
        act.polarity !==
          'negated'
    );

  const hasClearAction =
    !!actionAct ||
    semantic.acts.some(
      (act) =>
        act.kind ===
          'commitment' &&
        !act.blocksTaskCreation &&
        act.polarity !==
          'negated'
    );

  if (
    intent === 'unknown' &&
    derived.action
  ) {
    switch (
      derived.action.toLowerCase()
    ) {
      case 'postpone':
        intent =
          'postpone';
        break;

      case 'complete':
      case 'resolve':
        intent =
          'complete';
        break;

      case 'check':
      case 'investigate':
        intent =
          'create';
        break;

      default:
        if (hasClearAction) {
          intent =
            'create';
        }

        break;
    }

    if (
      intent !== 'unknown'
    ) {
      reasons.push(
        `intent:communication_refinement:${intent}`
      );
    }
  }

  let confidence:
    Confidence =
    normalisation.confidence;

  const confidenceRank:
    Record<Confidence, number> =
    {
      low: 0,
      medium: 1,
      high: 2,
    };

  if (
    confidenceRank[
      derived.communicationConfidence
    ] >
    confidenceRank[
      confidence
    ]
  ) {
    confidence =
      derived.communicationConfidence;

    reasons.push(
      'confidence:communication_evidence'
    );
  }

  if (
    semantic.confidence ===
      'high' &&
    confidence !== 'high'
  ) {
    confidence =
      'high';

    reasons.push(
      'confidence:semantic_evidence'
    );
  } else if (
    semantic.confidence ===
      'medium' &&
    confidence === 'low'
  ) {
    confidence =
      'medium';

    reasons.push(
      'confidence:semantic_evidence'
    );
  }

  /*
   * A contextual repair increases semantic confidence only modestly.
   * It must never turn uncertain speech into an automatic action merely
   * because a homophone was repaired.
   */
  if (
    options.transcriptRepairs?.length &&
    confidence === 'low'
  ) {
    confidence =
      'medium';

    reasons.push(
      'confidence:transcript_repair'
    );
  }

  if (
    intent === 'unknown'
  ) {
    confidence =
      confidence === 'high'
        ? 'medium'
        : 'low';

    reasons.push(
      'confidence:unknown_intent'
    );
  }

  if (hasClearAction) {
    confidence =
      confidence === 'low'
        ? 'medium'
        : confidence;

    reasons.push(
      'confidence:boost_clear_action'
    );
  }

  const ambiguity:
    AmbiguityLevel =
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

  if (
    ambiguity !== 'none'
  ) {
    reasons.push(
      `ambiguity:${ambiguity}`
    );
  }

  const statementType:
    StatementType =
    derived.statementType !==
    'UNKNOWN'
      ? derived.statementType
      : intent === 'ask'
        ? 'QUESTION'
        : intent === 'complete'
          ? 'STATUS_CHANGE'
          : intent === 'observe'
            ? 'OBSERVATION'
            : (
                intent ===
                  'create' ||
                intent ===
                  'remember' ||
                intent ===
                  'plan'
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

  const certainty:
    SpeechCertainty =
    semantic.acts.find(
      (act) =>
        act.certainty
    )?.certainty ??
    mapCommunicationCertainty(
      derived.certainty
    );

  const commitmentStrength =
    /\?\s*$/.test(text) ||
    /^(?:can|could|do|does|should|is|are|will|what|when|where|why|how)\b/i.test(text) ||
    /\b(?:i\s+)?(?:do\s+not|don't|never)\s+(?:need|have|got)\s+to\b/i.test(text) ||
    /\b(?:maybe|perhaps|probably|i\s+think)\b/i.test(text)
      ? 'none'
      : /\b(?:i\s+)?(?:need|have|got)\s+to\b|\b(?:i\s+)?must\b/i.test(text)
        ? 'strong'
        : deriveCommitmentStrength(
            statementType,
            derived.certainty,
            intent,
            hasClearAction
          );

  const urgency =
    deriveUrgency(
      text,
      semantic
    );

  const constraints =
    deriveConstraints(
      semantic
    );

  const entities =
    deriveEntities(
      semantic
    );

  const temporalReferences =
    deriveTemporalReferences(
      normalisation,
      semantic
    );

  const corrections:
    CorrectionSpan[] =
    normalisation.corrections ??
    [];

  const surfaceSummary =
    actionAct?.rawSpan?.slice(
      0,
      120
    ) ||
    actionAct?.objectText?.slice(
      0,
      120
    ) ||
    derived.action?.slice(
      0,
      120
    ) ||
    text.slice(
      0,
      120
    );

  const semanticCanProposeTask =
    canProposeTask(
      semantic
    );

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

    transcriptRepairs:
      options.transcriptRepairs ??
      [],

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