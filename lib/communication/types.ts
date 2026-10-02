import type { Confidence } from '@/lib/thinking/types';
export type { Confidence };

export type StatementType =
  | 'REQUEST' | 'REQUIREMENT' | 'PREFERENCE' | 'QUESTION' | 'ANSWER'
  | 'DECISION' | 'COMMITMENT' | 'OBSERVATION' | 'CONSTRAINT' | 'ASSUMPTION'
  | 'PROPOSAL' | 'CONFIRMATION' | 'CORRECTION' | 'RETRACTION' | 'UNCERTAINTY'
  | 'DECLARATION' | 'STATUS_CHANGE' | 'TASK' | 'FOLLOW_UP' | 'UNKNOWN';

export type Certainty = 'CONFIRMED' | 'PROVISIONAL' | 'NEEDS_CHECK' | 'DECLINED' | 'UNKNOWN';
export type SpeakerRole = 'CUSTOMER' | 'CONTRACTOR' | 'TEAM_MEMBER' | 'OTHER' | 'UNKNOWN';

export type DerivedMeaning = {
  normalised: string;
  statementType: StatementType;
  certainty: Certainty;
  confidence: Confidence;
  operators: string[];
  entities: { raw: string; kind: string; resolvedId: string | null; confidence: Confidence }[];
  temporals: { raw: string; resolvedDate: string | null; isCorrection: boolean }[];
  correction: { originalRaw: string; correctedRaw: string; facet: string; evidence: string } | null;
  requiresConfirmation: boolean;
  facets: { negation?: boolean };
  action?: string | null;
  object?: string | null;
  learnedMeaning?: string | null;
};

export type PhraseMeaning = {
  phrase: string;
  meaning: string;
  statementTypeHint?: StatementType;
  evidenceCount: number;
  lastEvidenceAt: string;
  source: 'observation' | 'explicit_correction' | 'repeated_usage';
};

export type PersonalCommunicationProfile = {
  userId: string;
  phraseMeanings: PhraseMeaning[];
  temporalPhrases: { phrase: string; interpretation: string; evidenceCount: number }[];
  entityAliases: {
    alias: string;
    entityKind: 'person' | 'job' | 'place' | 'thing';
    entityId: string | null;
    evidenceCount: number;
    active: boolean;
  }[];
  correctionPatterns: string[];
  inferenceTolerance: 'low' | 'medium' | 'high';
  confirmationPreference: 'frequent' | 'balanced' | 'minimal';
  uncertaintyPhrases: string[];
  style: { fragmentationRate: number; shorthandUsage: number };
  updatedAt: string;
};

export type LearningEvidence = {
  userId: string;
  kind:
    | 'phrase_observation'
    | 'explicit_correction'
    | 'accepted_interpretation'
    | 'rejected_interpretation'
    | 'temporal_shorthand'
    | 'entity_alias'
    | 'inference_feedback'
    | 'meeting_correction'
    | 'task_outcome';
  phrase?: string;
  meaning?: string;
  statementTypeHint?: StatementType;
  entityKind?: 'person' | 'job' | 'place' | 'thing';
  entityId?: string | null;
  weight?: number;
  observedAt?: string;
  detail?: {
    originalInterpretation?: string;
    correctedValue?: string;
    reason?: string;
    meetingId?: string;
    taskId?: string;
    outcome?: 'done' | 'partial' | 'carry' | 'skip' | 'edited';
  };
};

export type UnderstoodItem = {
  id: string;
  eventId: string;
  text: string;
  rawText: string;
  statementType: StatementType;
  certainty: Certainty;
  confidence: Confidence;
  speaker: SpeakerRole;
  requiresConfirmation: boolean;
  linkedObjectId: string | null;
};

export type MeetingUnderstanding = {
  meetingId: string;
  requirements: UnderstoodItem[];
  preferences: UnderstoodItem[];
  questions: UnderstoodItem[];
  responses: UnderstoodItem[];
  decisions: UnderstoodItem[];
  commitments: UnderstoodItem[];
  unresolved: UnderstoodItem[];
  observations: UnderstoodItem[];
  actions: UnderstoodItem[];
  overallConfidence: Confidence;
  candidates: {
    observations: { text: string; eventId: string }[];
    decisions: { text: string; eventId: string; certainty: Certainty }[];
    actions: { text: string; eventId: string; requiresConfirmation: boolean }[];
  };
};

export type MeetingUtterance = {
  id?: string;
  rawText: string;
  speaker: SpeakerRole;
  speakerName?: string | null;
  timestamp?: string;
};

export type ReviewStatus = 'pending' | 'accepted' | 'edited' | 'rejected';
export type ReviewTargetKind = 'task' | 'meeting_action' | 'meeting_decision' | 'meeting_observation';

export type ReviewItem = {
  id: string;
  meetingId: string;
  eventId: string;
  targetKind: ReviewTargetKind;
  text: string;
  originalText: string;
  rawText: string;
  status: ReviewStatus;
  certainty: Certainty;
  confidence: Confidence;
  requiresConfirmation: boolean;
  jobId: string | null;
  estimateMins: number | null;
};

export type ActionReviewSession = {
  id: string;
  meetingId: string;
  jobId: string | null;
  items: ReviewItem[];
  createdAt: string;
  isComplete: boolean;
};

export type TaskDraft = {
  text: string;
  original_input: string;
  job_id: string | null;
  estimate_mins: number;
  source: 'came_up';
  status: 'pending';
  due_today: boolean;
  surface_date: string | null;
  intended_time: string | null;
  info: string;
  meeting_id: string;
  meeting_action_event_id: string;
};

export type ClientMeetingSummary = {
  title: string;
  projectName: string | null;
  meetingDate: string | null;
  location: string | null;
  participants: string[];
  discussed: string[];
  customerRequirements: string[];
  agreed: string[];
  toConfirm: string[];
  nextSteps: string[];
};

export type MeetingCorrectionFeedback = {
  userId: string;
  meetingId: string;
  originalInterpretation: string;
  correctedValue: string;
  facet?: string;
  reason?: string;
  observedAt?: string;
};

export type TaskOutcomeFeedback = {
  userId: string;
  taskId: string;
  taskText: string;
  meetingId?: string;
  outcome: 'done' | 'partial' | 'carry' | 'skip' | 'edited';
  editedText?: string;
  observedAt?: string;
};

export function defaultPersonalCommunicationProfile(userId: string): PersonalCommunicationProfile {
  return {
    userId,
    phraseMeanings: [],
    temporalPhrases: [],
    entityAliases: [],
    correctionPatterns: [],
    inferenceTolerance: 'medium',
    confirmationPreference: 'balanced',
    uncertaintyPhrases: [],
    style: { fragmentationRate: 0, shorthandUsage: 0 },
    updatedAt: new Date().toISOString(),
  };
}

export function emptyMeetingUnderstanding(meetingId: string): MeetingUnderstanding {
  return {
    meetingId,
    requirements: [],
    preferences: [],
    questions: [],
    responses: [],
    decisions: [],
    commitments: [],
    unresolved: [],
    observations: [],
    actions: [],
    overallConfidence: 'low',
    candidates: { observations: [], decisions: [], actions: [] },
  };
}

export function emptyDerivedMeaning(raw: string): DerivedMeaning {
  return {
    normalised: raw.trim(),
    statementType: 'UNKNOWN',
    certainty: 'UNKNOWN',
    confidence: 'low',
    operators: [],
    entities: [],
    temporals: [],
    correction: null,
    requiresConfirmation: true,
    facets: {},
    action: null,
    object: null,
    learnedMeaning: null,
  };
}
