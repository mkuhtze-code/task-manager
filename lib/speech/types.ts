/**
 * Dokkit Speech Intelligence — canonical types.
 * Layers: raw audio → transcript → normalised text → interpretation → action/learning
 * Transcription providers are replaceable. Understanding is Dokkit-owned and deterministic.
 */

import type { Confidence } from '@/lib/thinking/types';
import type {
  Certainty as CommCertainty,
  StatementType,
  PersonalCommunicationProfile,
} from '@/lib/communication/types';

export type { Confidence };

export type SpeechCaptureStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'stopping'
  | 'failed'
  | 'cancelled';

export type SpeechSessionStatus =
  | 'capturing'
  | 'captured'
  | 'queued_transcription'
  | 'transcribing'
  | 'transcribed'
  | 'normalised'
  | 'interpreted'
  | 'failed'
  | 'cancelled';

export type SpeechInput = {
  audioRef?: string;
  blob?: Blob;
  mimeType?: string;
  durationMs?: number;
  languageHint?: string;
  sessionId?: string;
};

export type TranscriptSegment = {
  text: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
};

export type TranscriptionResult = {
  text: string;
  language?: string;
  confidence?: number;
  durationMs?: number;
  segments?: TranscriptSegment[];
  provider?: string;
  providerVersion?: string;
  createdAt: string;
  raw?: unknown;
};

export type SpeechTranscriptionProvider = {
  readonly id: string;
  readonly version: string;
  transcribe(input: SpeechInput): Promise<TranscriptionResult>;
  supportsOffline?: boolean;
};

export type SpokenPunctuationHit = {
  spoken: string;
  replacement: string;
  index: number;
};

export type CorrectionSpan = {
  marker: string;
  originalRaw: string;
  correctedRaw: string;
  facet: 'date' | 'time' | 'entity' | 'action' | 'generic';
  confidence: Confidence;
};

export type TemporalReference = {
  raw: string;
  kind:
    | 'today'
    | 'tomorrow'
    | 'yesterday'
    | 'weekday'
    | 'relative_day'
    | 'relative_week'
    | 'time_of_day'
    | 'clock_time'
    | 'deadline'
    | 'vague'
    | 'unknown';
  resolvedDate: string | null;
  resolvedTime: string | null;
  isCorrection: boolean;
  confidence: Confidence;
};

export type NormalisationResult = {
  originalText: string;
  normalisedText: string;
  fillersRemoved: string[];
  /** Adjacent stutter tokens collapsed (e.g. "John John" → "John") */
  repetitionsCollapsed: string[];
  punctuationApplied: SpokenPunctuationHit[];
  corrections: CorrectionSpan[];
  temporals: TemporalReference[];
  numbersExpanded: { raw: string; value: string }[];
  confidence: Confidence;
};

export type SpeechIntent =
  | 'create'
  | 'edit'
  | 'delete'
  | 'ask'
  | 'explain'
  | 'record'
  | 'remember'
  | 'schedule'
  | 'postpone'
  | 'complete'
  | 'cancel'
  | 'search'
  | 'navigate'
  | 'observe'
  | 'plan'
  | 'unknown';

export type CommitmentStrength = 'none' | 'weak' | 'moderate' | 'strong';
export type UrgencySignal = 'explicit' | 'implied' | 'none' | 'unknown';
export type ConstraintSignal =
  | 'dependency'
  | 'competing_work'
  | 'person_dependency'
  | 'location'
  | 'time'
  | 'resource'
  | 'uncertainty'
  | 'none';
export type AmbiguityLevel = 'none' | 'partial' | 'high';
export type SpeechCertainty =
  | 'definite'
  | 'likely'
  | 'probable'
  | 'tentative'
  | 'uncertain'
  | 'speculative'
  | 'unknown';

export type EntityMention = {
  raw: string;
  kind: 'person' | 'job' | 'place' | 'thing' | 'unknown';
  resolvedId: string | null;
  confidence: Confidence;
  wasCorrected: boolean;
};

export type SpeechInterpretation = {
  id: string;
  transcriptId?: string;
  sessionId?: string;
  originalTranscript: string;
  normalisedText: string;
  intent: SpeechIntent;
  statementType: StatementType;
  certainty: SpeechCertainty;
  commitmentStrength: CommitmentStrength;
  urgency: UrgencySignal;
  constraints: ConstraintSignal[];
  temporalReferences: TemporalReference[];
  entities: EntityMention[];
  corrections: CorrectionSpan[];
  ambiguity: AmbiguityLevel;
  surfaceSummary: string;
  confidence: Confidence;
  reasons: string[];
  requiresConfirmation: boolean;
  createdAt: string;
};

export type SpeechLearningEventKind =
  | 'speech_correction'
  | 'transcription_correction'
  | 'interpretation_confirmed'
  | 'interpretation_corrected'
  | 'vocabulary_observation'
  | 'phrase_pattern'
  | 'certainty_language'
  | 'commitment_language';

export type SpeechLearningEvent = {
  id: string;
  userId: string;
  kind: SpeechLearningEventKind;
  inputText?: string;
  originalInterpretation?: string;
  correctedInterpretation?: string;
  signal?: string;
  value?: string;
  context?: Record<string, unknown>;
  evidenceCount: number;
  confidence: Confidence;
  createdAt: string;
  updatedAt: string;
};

export type PersonalSpeechVocabularyEntry = {
  spoken: string;
  preferred: string;
  evidenceCount: number;
  source: 'explicit_correction' | 'repeated_usage' | 'observation';
  lastEvidenceAt: string;
};

export type PersonalLanguageModel = {
  userId: string;
  vocabulary: PersonalSpeechVocabularyEntry[];
  taskIntroductionPhrases: { phrase: string; evidenceCount: number }[];
  certaintyPhrases: { phrase: string; mapsTo: SpeechCertainty; evidenceCount: number }[];
  commitmentPhrases: { phrase: string; mapsTo: CommitmentStrength; evidenceCount: number }[];
  nameAliases: { spoken: string; canonical: string; evidenceCount: number }[];
  updatedAt: string;
};

export function emptyPersonalLanguageModel(userId: string): PersonalLanguageModel {
  return {
    userId,
    vocabulary: [],
    taskIntroductionPhrases: [],
    certaintyPhrases: [],
    commitmentPhrases: [],
    nameAliases: [],
    updatedAt: new Date().toISOString(),
  };
}

export type SpeechSession = {
  id: string;
  userId?: string;
  status: SpeechSessionStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  language?: string;
  audioRef?: string;
  mimeType?: string;
  transcript?: TranscriptionResult;
  normalisation?: NormalisationResult;
  interpretation?: SpeechInterpretation;
  error?: string;
  transcriptionAttempts: number;
};

export type SpeechPipelineResult = {
  session: SpeechSession;
  interpretation: SpeechInterpretation | null;
  communicationProfileHint?: PersonalCommunicationProfile | null;
};

export function speechCertaintyToComm(c: SpeechCertainty): CommCertainty {
  switch (c) {
    case 'definite':
      return 'CONFIRMED';
    case 'likely':
    case 'probable':
      return 'PROVISIONAL';
    case 'tentative':
    case 'uncertain':
    case 'speculative':
      return 'NEEDS_CHECK';
    default:
      return 'UNKNOWN';
  }
}
