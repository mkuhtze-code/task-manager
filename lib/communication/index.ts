export type {
  StatementType,
  Certainty,
  SpeakerRole,
  DerivedMeaning,
  PhraseMeaning,
  PersonalCommunicationProfile,
  LearningEvidence,
  UnderstoodItem,
  MeetingUnderstanding,
  MeetingUtterance,
  ReviewStatus,
  ReviewItem,
  ActionReviewSession,
  TaskDraft,
  ClientMeetingSummary,
  MeetingCorrectionFeedback,
  TaskOutcomeFeedback,
  Confidence,
} from './types';

export {
  defaultPersonalCommunicationProfile,
  emptyMeetingUnderstanding,
  emptyDerivedMeaning,
} from './types';

export {
  formatObservationText,
  parseObservationText,
  toEngineSpeaker,
  observationsToUtterances,
} from './speaker';
export type { CaptureSpeaker, ParsedObservationText } from './speaker';

export { understand } from './understand';
export type { UnderstandOptions } from './understand';

export { processMeetingConversation } from './meeting';
export type { ProcessMeetingOptions } from './meeting';

export {
  createProfile,
  applyEvidence,
  lookupPhraseMeaning,
  findLearnedPhrases,
  recordExplicitPhraseCorrection,
  normalisePhrase,
  MIN_EVIDENCE_OBSERVATION,
  MIN_EVIDENCE_EXPLICIT,
  EXPLICIT_CORRECTION_WEIGHT,
} from './learning';

export {
  feedbackFromReviewSession,
  feedbackFromMeetingCorrection,
  feedbackFromTaskOutcome,
  processLearningFeedback,
} from './feedback';
export type { FeedbackBatchResult } from './feedback';

export {
  createReviewSession,
  acceptItem,
  rejectItem,
  acceptAll,
  rejectAll,
  finaliseReview,
  reviewSummary,
} from './review';
export type { CreateReviewSessionOptions } from './review';

export {
  buildClientMeetingSummary,
  formatClientSummaryPlainText,
  validateClientSummary,
} from './export';
export type { BuildClientSummaryOptions } from './export';
