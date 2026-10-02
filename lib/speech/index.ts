/**
 * Dokkit Speech Intelligence Engine
 *
 * Capture is intentional only (no ambient listening).
 * Transcription is provider-abstracted.
 * Understanding is deterministic and layered.
 */

export type {
  SpeechCaptureStatus,
  SpeechSessionStatus,
  SpeechInput,
  TranscriptSegment,
  TranscriptionResult,
  SpeechTranscriptionProvider,
  SpokenPunctuationHit,
  CorrectionSpan,
  TemporalReference,
  NormalisationResult,
  SpeechIntent,
  CommitmentStrength,
  UrgencySignal,
  ConstraintSignal,
  AmbiguityLevel,
  SpeechCertainty,
  EntityMention,
  SpeechInterpretation,
  SpeechLearningEventKind,
  SpeechLearningEvent,
  PersonalSpeechVocabularyEntry,
  PersonalLanguageModel,
  SpeechSession,
  SpeechPipelineResult,
  Confidence,
} from './types';

export { emptyPersonalLanguageModel, speechCertaintyToComm } from './types';

export {
  normaliseSpeech,
  stripFillers,
  applySpokenPunctuation,
  detectCorrections,
  expandSpokenNumbers,
  extractTemporals,
} from './normalise';

export { interpretSpeech } from './interpret';
export type { InterpretSpeechOptions } from './interpret';

export {
  createSpeechSession,
  persistSpeechAudio,
  transcribeSession,
  processSpeechText,
  runSpeechPipeline,
} from './pipeline';

export {
  getTranscriptionProvider,
  setTranscriptionProvider,
  resetTranscriptionProvider,
  nullTranscriptionProvider,
} from './providers';

export {
  createSpeechLearningEvent,
  recordSpeechCorrection,
  observeConfirmedInterpretation,
  applyVocabulary,
  emptyModel,
  confidenceForEvidence,
  MIN_EVIDENCE_EXPLICIT,
  MIN_EVIDENCE_OBSERVATION,
} from './learning';
