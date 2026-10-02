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
  buildClientMeetingSummary,
  formatClientSummaryPlainText,
  validateClientSummary,
} from './export';
export type { BuildClientSummaryOptions } from './export';

// Remaining modules (understand, meeting, feedback, review) are added in follow-up commits.
