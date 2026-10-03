/**
 * Speech-side learning events → personal language model.
 *
 * Evidence accumulation only; never learn a weak guess.
 *
 * Important distinction:
 *
 * - vocabulary corrections are lexical
 * - transcription repairs are contextual
 *
 * A user correcting "weather" → "whether" must NOT create a global
 * "weather always means whether" rule.
 */

import {
  applyEvidence,
  MIN_EVIDENCE_EXPLICIT,
  MIN_EVIDENCE_OBSERVATION,
  normalisePhrase,
} from '@/lib/communication/learning';

import type {
  LearningEvidence,
  PersonalCommunicationProfile,
} from '@/lib/communication/types';

import type {
  PersonalLanguageModel,
  PersonalSpeechVocabularyEntry,
  PersonalTranscriptionRepair,
  SpeechInterpretation,
  SpeechLearningEvent,
  SpeechCertainty,
  CommitmentStrength,
  Confidence,
  TranscriptRepair,
} from './types';

import {
  emptyPersonalLanguageModel,
} from './types';

export {
  MIN_EVIDENCE_EXPLICIT,
  MIN_EVIDENCE_OBSERVATION,
};

function makeId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `sle-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export function createSpeechLearningEvent(
  partial: Omit<
    SpeechLearningEvent,
    | 'id'
    | 'evidenceCount'
    | 'createdAt'
    | 'updatedAt'
  > & {
    evidenceCount?: number;
  }
): SpeechLearningEvent {
  const now =
    new Date().toISOString();

  return {
    id: makeId(),
    evidenceCount:
      partial.evidenceCount ?? 1,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function recordSpeechCorrection(
  model: PersonalLanguageModel,
  profile: PersonalCommunicationProfile,
  args: {
    inputText: string;
    originalInterpretation: string;
    correctedInterpretation: string;
    kind?:
      | 'speech_correction'
      | 'transcription_correction'
      | 'interpretation_corrected';
  }
): {
  model: PersonalLanguageModel;
  profile: PersonalCommunicationProfile;
  event: SpeechLearningEvent;
} {
  const now =
    new Date().toISOString();

  const event =
    createSpeechLearningEvent({
      userId: model.userId,

      kind:
        args.kind ??
        'speech_correction',

      inputText:
        args.inputText,

      originalInterpretation:
        args.originalInterpretation,

      correctedInterpretation:
        args.correctedInterpretation,

      evidenceCount: 3,
      confidence: 'high',
    });

  const vocab =
    upsertVocabulary(
      model.vocabulary,
      {
        spoken:
          args.originalInterpretation,

        preferred:
          args.correctedInterpretation,

        source:
          'explicit_correction',

        evidenceCount: 3,

        lastEvidenceAt: now,
      }
    );

  const nextModel:
    PersonalLanguageModel = {
    ...model,
    vocabulary: vocab,
    updatedAt: now,
  };

  const evidence:
    LearningEvidence = {
    userId:
      profile.userId,

    kind:
      'explicit_correction',

    phrase:
      args.originalInterpretation,

    meaning:
      args.correctedInterpretation,

    weight: 3,

    observedAt: now,

    detail: {
      originalInterpretation:
        args.originalInterpretation,

      correctedValue:
        args.correctedInterpretation,

      reason:
        'speech_correction',
    },
  };

  return {
    model: nextModel,

    profile:
      applyEvidence(
        profile,
        evidence
      ),

    event,
  };
}

/**
 * Record a specific STT homophone repair.
 *
 * Example:
 *
 *   weather → whether
 *
 * The context is stored with the evidence.
 *
 * This is intentionally separate from vocabulary because the same
 * spoken form can legitimately represent different words.
 */
export function recordTranscriptionRepair(
  model: PersonalLanguageModel,
  repair: TranscriptRepair
): PersonalLanguageModel {
  const now =
    new Date().toISOString();

  const from =
    normalisePhrase(
      repair.original
    );

  const to =
    normalisePhrase(
      repair.replacement
    );

  if (
    !from ||
    !to ||
    from === to
  ) {
    return model;
  }

  const existing =
    model.transcriptionRepairs.find(
      (entry) =>
        normalisePhrase(entry.from) ===
          from &&
        normalisePhrase(entry.to) ===
          to
    );

  if (!existing) {
    const entry:
      PersonalTranscriptionRepair = {
      from,
      to,
      context:
        repair.context,
      evidenceCount: 1,
      lastEvidenceAt: now,
    };

    return {
      ...model,

      transcriptionRepairs: [
        ...model.transcriptionRepairs,
        entry,
      ],

      updatedAt: now,
    };
  }

  return {
    ...model,

    transcriptionRepairs:
      model.transcriptionRepairs.map(
        (entry) =>
          normalisePhrase(entry.from) ===
            from &&
          normalisePhrase(entry.to) ===
            to
            ? {
                ...entry,

                evidenceCount:
                  entry.evidenceCount +
                  1,

                context:
                  repair.context ??
                  entry.context,

                lastEvidenceAt:
                  now,
              }
            : entry
      ),

    updatedAt: now,
  };
}

/**
 * Record every repair that the user explicitly accepts.
 *
 * Acceptance is stronger evidence than an automatic repair.
 */
export function confirmTranscriptRepairs(
  model: PersonalLanguageModel,
  repairs: TranscriptRepair[]
): PersonalLanguageModel {
  let next = model;

  for (const repair of repairs) {
    next =
      recordTranscriptionRepair(
        next,
        repair
      );

    /*
     * Explicit confirmation gets an additional evidence bump.
     */
    next =
      recordTranscriptionRepair(
        next,
        repair
      );
  }

  return next;
}

/**
 * Record a correction where the user tells Dokkit what the STT actually
 * heard versus what was intended.
 *
 * This is the preferred learning entry point for voice correction UX.
 */
export function learnTranscriptCorrection(
  model: PersonalLanguageModel,
  args: {
    originalWord: string;
    correctedWord: string;
    context?: string;
  }
): PersonalLanguageModel {
  const now =
    new Date().toISOString();

  const from =
    normalisePhrase(
      args.originalWord
    );

  const to =
    normalisePhrase(
      args.correctedWord
    );

  if (
    !from ||
    !to ||
    from === to
  ) {
    return model;
  }

  const existing =
    model.transcriptionRepairs.find(
      (repair) =>
        normalisePhrase(
          repair.from
        ) === from &&
        normalisePhrase(
          repair.to
        ) === to
    );

  if (!existing) {
    return {
      ...model,

      transcriptionRepairs: [
        ...model.transcriptionRepairs,
        {
          from,
          to,
          context:
            args.context,
          evidenceCount: 3,
          lastEvidenceAt: now,
        },
      ],

      updatedAt: now,
    };
  }

  return {
    ...model,

    transcriptionRepairs:
      model.transcriptionRepairs.map(
        (repair) =>
          normalisePhrase(
            repair.from
          ) === from &&
          normalisePhrase(
            repair.to
          ) === to
            ? {
                ...repair,

                evidenceCount:
                  repair.evidenceCount +
                  3,

                context:
                  args.context ??
                  repair.context,

                lastEvidenceAt:
                  now,
              }
            : repair
      ),

    updatedAt: now,
  };
}

function upsertVocabulary(
  list:
    PersonalSpeechVocabularyEntry[],
  entry:
    PersonalSpeechVocabularyEntry
): PersonalSpeechVocabularyEntry[] {
  const key =
    normalisePhrase(
      entry.spoken
    );

  const existing =
    list.find(
      (v) =>
        normalisePhrase(
          v.spoken
        ) === key
    );

  if (!existing) {
    return [
      ...list,
      entry,
    ];
  }

  return list.map(
    (v) =>
      normalisePhrase(
        v.spoken
      ) === key
        ? {
            ...v,

            preferred:
              entry.preferred,

            evidenceCount:
              v.evidenceCount +
              entry.evidenceCount,

            source:
              entry.source ===
              'explicit_correction'
                ? 'explicit_correction'
                : v.source,

            lastEvidenceAt:
              entry.lastEvidenceAt,
          }
        : v
  );
}

export function observeConfirmedInterpretation(
  model: PersonalLanguageModel,
  interpretation: SpeechInterpretation
): PersonalLanguageModel {
  const now =
    new Date().toISOString();

  let certaintyPhrases =
    [...model.certaintyPhrases];

  let commitmentPhrases =
    [...model.commitmentPhrases];

  const certCue =
    matchCertaintyCue(
      interpretation.originalTranscript,
      interpretation.certainty
    );

  if (certCue) {
    certaintyPhrases =
      bumpPhrase(
        certaintyPhrases,
        certCue,
        interpretation.certainty
      );
  }

  const commitCue =
    matchCommitmentCue(
      interpretation.originalTranscript,
      interpretation.commitmentStrength
    );

  if (commitCue) {
    commitmentPhrases =
      bumpCommitment(
        commitmentPhrases,
        commitCue,
        interpretation.commitmentStrength
      );
  }

  /*
   * Confirmed transcript repairs are learned here as well.
   *
   * This closes the loop:
   *
   * interpret → user confirms → learn → future interpretation.
   */
  if (
    interpretation.transcriptRepairs?.length
  ) {
    for (
      const repair of
        interpretation.transcriptRepairs
    ) {
      model =
        recordTranscriptionRepair(
          model,
          repair
        );
    }
  }

  return {
    ...model,

    certaintyPhrases,
    commitmentPhrases,

    updatedAt: now,
  };
}

function matchCertaintyCue(
  text: string,
  certainty: SpeechCertainty
): string | null {
  const lower =
    text.toLowerCase();

  const map:
    Record<
      SpeechCertainty,
      string[]
    > = {
    definite: [
      'absolutely',
      'definitely',
      'must',
    ],

    likely: [
      'certainly',
      'for sure',
    ],

    probable: [
      'probably',
      'likely',
    ],

    tentative: [
      "i'll try",
      'try and',
      'hopefully',
    ],

    uncertain: [
      'maybe',
      'perhaps',
      'not sure',
    ],

    speculative: [
      'sometime',
      'whenever',
    ],

    unknown: [],
  };

  for (
    const phrase of
      map[certainty] ?? []
  ) {
    if (
      lower.includes(phrase)
    ) {
      return phrase;
    }
  }

  return null;
}

function matchCommitmentCue(
  text: string,
  strength: CommitmentStrength
): string | null {
  const lower =
    text.toLowerCase();

  if (
    strength === 'strong' &&
    /\babsolutely need\b/.test(
      lower
    )
  ) {
    return 'absolutely need';
  }

  if (
    strength === 'weak' &&
    /\bi'?ll try\b/.test(
      lower
    )
  ) {
    return "i'll try";
  }

  if (
    strength === 'moderate' &&
    /\bi'?ll\b/.test(
      lower
    )
  ) {
    return "i'll";
  }

  return null;
}

function bumpPhrase(
  list: {
    phrase: string;
    mapsTo: SpeechCertainty;
    evidenceCount: number;
  }[],
  phrase: string,
  mapsTo: SpeechCertainty
) {
  const key =
    normalisePhrase(
      phrase
    );

  const existing =
    list.find(
      (p) =>
        p.phrase === key
    );

  if (existing) {
    return list.map(
      (p) =>
        p.phrase === key
          ? {
              ...p,
              evidenceCount:
                p.evidenceCount +
                1,
              mapsTo,
            }
          : p
    );
  }

  return [
    ...list,
    {
      phrase: key,
      mapsTo,
      evidenceCount: 1,
    },
  ];
}

function bumpCommitment(
  list: {
    phrase: string;
    mapsTo: CommitmentStrength;
    evidenceCount: number;
  }[],
  phrase: string,
  mapsTo: CommitmentStrength
) {
  const key =
    normalisePhrase(
      phrase
    );

  const existing =
    list.find(
      (p) =>
        p.phrase === key
    );

  if (existing) {
    return list.map(
      (p) =>
        p.phrase === key
          ? {
              ...p,
              evidenceCount:
                p.evidenceCount +
                1,
              mapsTo,
            }
          : p
    );
  }

  return [
    ...list,
    {
      phrase: key,
      mapsTo,
      evidenceCount: 1,
    },
  ];
}

export function applyVocabulary(
  text: string,
  model: PersonalLanguageModel
): {
  text: string;
  applied: string[];
} {
  let result = text;

  const applied: string[] =
    [];

  const sorted =
    [...model.vocabulary].sort(
      (a, b) =>
        b.spoken.length -
        a.spoken.length
    );

  for (const v of sorted) {
    const min =
      v.source ===
      'explicit_correction'
        ? MIN_EVIDENCE_EXPLICIT
        : MIN_EVIDENCE_OBSERVATION;

    if (
      v.evidenceCount <
      min
    ) {
      continue;
    }

    const re =
      new RegExp(
        `\\b${escapeRegExp(
          v.spoken
        )}\\b`,
        'gi'
      );

    if (re.test(result)) {
      result =
        result.replace(
          re,
          v.preferred
        );

      applied.push(
        `${v.spoken}→${v.preferred}`
      );
    }
  }

  return {
    text: result,
    applied,
  };
}

function escapeRegExp(
  s: string
): string {
  return s.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

export function emptyModel(
  userId: string
): PersonalLanguageModel {
  return emptyPersonalLanguageModel(
    userId
  );
}

export function confidenceForEvidence(
  count: number,
  explicit: boolean
): Confidence {
  if (
    explicit &&
    count >=
      MIN_EVIDENCE_EXPLICIT
  ) {
    return 'high';
  }

  if (
    count >=
    MIN_EVIDENCE_OBSERVATION + 2
  ) {
    return 'high';
  }

  if (
    count >=
    MIN_EVIDENCE_OBSERVATION
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Explicit alias:
 *
 * "when I say Hendo I mean Henderson"
 *
 * Evidence-gated; no silent overwrite of strong rivals.
 */
export function recordNameAlias(
  model: PersonalLanguageModel,
  spoken: string,
  canonical: string
): PersonalLanguageModel {
  const now =
    new Date().toISOString();

  const key =
    spoken
      .trim()
      .toLowerCase();

  const existing =
    model.nameAliases.find(
      (a) =>
        a.spoken.toLowerCase() ===
        key
    );

  if (existing) {
    if (
      existing.canonical.toLowerCase() !==
      canonical
        .trim()
        .toLowerCase()
    ) {
      if (
        existing.evidenceCount <
        3
      ) {
        return {
          ...model,

          nameAliases:
            model.nameAliases.map(
              (a) =>
                a.spoken.toLowerCase() ===
                  key
                  ? {
                      ...a,
                      canonical:
                        canonical.trim(),
                      evidenceCount:
                        a.evidenceCount +
                        1,
                    }
                  : a
            ),

          updatedAt: now,
        };
      }

      return {
        ...model,

        nameAliases: [
          ...model.nameAliases,

          {
            spoken:
              spoken.trim(),

            canonical:
              canonical.trim(),

            evidenceCount: 1,
          },
        ],

        updatedAt: now,
      };
    }

    return {
      ...model,

      nameAliases:
        model.nameAliases.map(
          (a) =>
            a.spoken.toLowerCase() ===
              key
              ? {
                  ...a,
                  evidenceCount:
                    a.evidenceCount +
                    1,
                }
              : a
        ),

      updatedAt: now,
    };
  }

  return {
    ...model,

    nameAliases: [
      ...model.nameAliases,

      {
        spoken:
          spoken.trim(),

        canonical:
          canonical.trim(),

        evidenceCount: 3,
      },
    ],

    updatedAt: now,
  };
}

/**
 * Apply aliases only when evidence threshold is met.
 */
export function applyNameAliases(
  text: string,
  model:
    | PersonalLanguageModel
    | null
    | undefined
): string {
  if (
    !model?.nameAliases?.length
  ) {
    return text;
  }

  let out = text;

  for (
    const alias of
      model.nameAliases
  ) {
    if (
      alias.evidenceCount <
      MIN_EVIDENCE_EXPLICIT
    ) {
      continue;
    }

    const escaped =
      alias.spoken.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

    const re =
      new RegExp(
        '\\b' +
          escaped +
          '\\b',
        'gi'
      );

    out =
      out.replace(
        re,
        alias.canonical
      );
  }

  return out;
}