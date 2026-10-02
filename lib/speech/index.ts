/**
 * Dokkit Speech Intelligence Engine
 *
 * Capture is intentional only (no ambient listening).
 * Transcription is provider-abstracted.
 * Understanding is deterministic and layered.
 * Semantic layer composes multi-act meaning and gates false tasks.
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
  collapseRepetitions,
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
  useDefaultBrowserProvider,
  nullTranscriptionProvider,
  webSpeechProvider,
  isWebSpeechAvailable,
  recognizeLive,
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

export {
  emitSpeechEvent,
  setSpeechInstrumentSink,
} from './instrument';
export type {
  SpeechInstrumentEvent,
  SpeechInstrumentPayload,
  SpeechInstrumentSink,
} from './instrument';

export {
  runSpeechBenchmark,
  formatBenchmarkReport,
  runMustNotCorrectAudit,
  DEFAULT_BENCHMARK_CASES,
} from './benchmark';
export type { BenchmarkCase, BenchmarkReport, LayerScore } from './benchmark';

export { MUST_NOT_CORRECT } from './golden/mustNotCorrect';
export { MUST_NOT_CREATE_TASK } from './golden/mustNotCreateTask';

export {
  extractActionClauses,
  hasMultiActionCandidate,
} from './multiClause';
export type { ActionClause } from './multiClause';

export {
  composeSemanticUtterance,
  canProposeTask,
  detectPolarity,
  isActionNegated,
  textLevelSafety,
  buildCorrectionChain,
} from './semantic';
export type {
  SemanticUtterance,
  SemanticAct,
  ActKind,
  Polarity,
  CorrectionStep,
  SafetyVerdict,
} from './semantic';
