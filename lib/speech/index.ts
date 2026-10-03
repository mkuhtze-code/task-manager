/**
 * Dokkit Speech Intelligence Engine
 * Capture intentional only. Understanding deterministic. Decision: understanding ≠ act.
 * UI should prefer processCaptureSpeech over lower layers.
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
  TranscriptRepair,
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

export { repairTranscript } from './sttRepair';

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
  recordNameAlias,
  applyNameAliases,
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
  positiveActionActs,
  detectPolarity,
  isActionNegated,
  textLevelSafety,
  buildCorrectionChain,
  linkEntitiesInText,
  emptySpeechContext,
} from './semantic';
export type {
  SemanticUtterance,
  SemanticAct,
  ActKind,
  Polarity,
  CorrectionStep,
  SafetyVerdict,
  SemanticActionOutcome,
  SpeechUnderstandingContext,
  ContextEntity,
  EntityLink,
} from './semantic';

export { decideSpeechActions, decisionWouldCreateTask, semanticOutcome } from './decision';
export type { SpeechDecision, ActDecision, ActionKind } from './decision';

export {
  processCaptureSpeech,
  confirmCaptureSpeech,
  rejectOrCorrectCaptureSpeech,
  captureMustNotCreate,
} from './captureAdapter';
export type {
  CaptureSpeechResult,
  CaptureProposal,
  CaptureUiMode,
  ProcessCaptureSpeechInput,
} from './captureAdapter';

export {
  loadSpeechLanguageModel,
  saveSpeechLanguageModel,
  clearSpeechLanguageModel,
} from './speechModelStore';
