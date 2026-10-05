/**
 * Personal Operating Engine — shared contracts.
 *
 * Thin, deterministic. Prefer existing repo terminology where it overlaps
 * (Confidence, DecisionTrace, DerivedMeaning). No LLM.
 */

export type Confidence = 'low' | 'medium' | 'high';

export type MemoryItemType =
  | 'utterance'
  | 'entity'
  | 'task'
  | 'job'
  | 'location'
  | 'meeting'
  | 'suggestion'
  | 'action'
  | 'correction'
  | 'request'
  | 'list_item'
  | 'reference';

export type MemoryItem = {
  id: string;
  type: MemoryItemType;
  label: string;
  source: string;
  timestamp: string;
  salience: number;
  confidence: Confidence;
  /** Free-form links: taskId, jobId, requestId, etc. */
  relationships: Record<string, string>;
  /** Optional structured payload */
  payload?: Record<string, unknown>;
};

export type CurrentFocus = {
  kind: 'task' | 'job' | 'list' | 'meeting' | 'request' | 'none';
  id: string | null;
  label: string | null;
};

export type WorkingMemorySnapshot = {
  version: 1;
  updatedAt: string;
  recentUtterances: MemoryItem[];
  recentEntities: MemoryItem[];
  recentTasks: MemoryItem[];
  recentJobs: MemoryItem[];
  recentLocations: MemoryItem[];
  recentSuggestions: MemoryItem[];
  recentActions: MemoryItem[];
  recentCorrections: MemoryItem[];
  currentFocus: CurrentFocus;
  currentTopic: string | null;
  currentSurface: string | null;
  unresolvedReferences: MemoryItem[];
  /** Active structured request under refinement */
  activeRequestId: string | null;
};

/** Intent the user wants to accomplish — not UI chrome. */
export type RequestAction =
  | 'remind'
  | 'pickup'
  | 'create_task'
  | 'complete'
  | 'append_list'
  | 'create_list'
  | 'move'
  | 'defer'
  | 'refine'
  | 'query'
  | 'unknown';

export type ConstraintAxis =
  | 'temporal'
  | 'location'
  | 'urgency'
  | 'importance'
  | 'commitment'
  | 'flexibility'
  | 'dependency'
  | 'consequence'
  | 'duration'
  | 'capacity'
  | 'preference';

export type Constraint = {
  axis: ConstraintAxis;
  value: string;
  confidence: Confidence;
  source: string;
};

export type EngineRequest = {
  id: string;
  action: RequestAction;
  objectText: string | null;
  locationText: string | null;
  relatedJobText: string | null;
  relatedMeetingText: string | null;
  dateHint: string | null;
  timeHint: string | null;
  urgency: 'none' | 'elevated' | 'high';
  flexibility: 'high' | 'medium' | 'low';
  commitment: 'weak' | 'soft' | 'hard';
  consequence: string | null;
  constraints: Constraint[];
  rawUtterances: string[];
  /**
   * Canonical task title locked on first structured capture.
   * Refinements update constraints (date, job, urgency) — not this title —
   * unless the user explicitly renames the object.
   */
  titleText: string | null;
  confidence: Confidence;
  updatedAt: string;
};

export type CommitmentClass =
  | 'HARD_COMMITMENT'
  | 'SOFT_COMMITMENT'
  | 'PLANNED_WORK'
  | 'SUGGESTED_WORK'
  | 'NEW_REQUEST';

export type AutonomyLevel = 'observe' | 'suggest' | 'ask' | 'act';

export type AuthorityDecision = {
  commitmentClass: CommitmentClass;
  autonomy: AutonomyLevel;
  mayAct: boolean;
  maySuggest: boolean;
  reason: string;
};

export type PlanStep =
  | { kind: 'place'; surfaceDate: string | null; reason: string }
  | { kind: 'attach_job'; jobId: string | null; jobName: string; reason: string }
  | { kind: 'attach_location'; locationText: string; reason: string }
  | { kind: 'suggest'; message: string; reason: string }
  | { kind: 'ask'; message: string; reason: string }
  | { kind: 'protect'; message: string; reason: string }
  | { kind: 'create_task'; text: string; reason: string };

export type PlanProposal = {
  steps: PlanStep[];
  summary: string;
  confidence: Confidence;
  facts: string[];
};

export type EngineAction =
  | {
      kind: 'create_task';
      text: string;
      locationText: string | null;
      jobId: string | null;
      surfaceDate: string | null;
      estimateMins: number;
    }
  | {
      kind: 'update_task';
      taskId: string;
      text: string;
      locationText: string | null;
      jobId: string | null;
      surfaceDate: string | null;
      estimateMins: number | null;
    }
  | { kind: 'suggest'; message: string }
  | { kind: 'ask'; message: string }
  | { kind: 'noop'; message: string };

export type LearningEvidence = {
  id: string;
  kind:
    | 'interpretation'
    | 'decision'
    | 'acceptance'
    | 'rejection'
    | 'correction'
    | 'outcome'
    | 'reference_resolved';
  timestamp: string;
  requestId: string | null;
  payload: Record<string, unknown>;
};

export type ReasoningContext = {
  nowIso: string;
  surfaceDate: string | null;
  remainingMinsToday: number | null;
  openTaskCount: number;
  jobs: Array<{ id: string; name: string; locationText?: string | null }>;
  meetings: Array<{ id: string; text: string; startAt?: string | null }>;
  knownLocations: string[];
  communicationHints: string[];
  workingMemory: WorkingMemorySnapshot;
};

export type EngineCycleResult = {
  meaningSummary: string;
  request: EngineRequest;
  workingMemory: WorkingMemorySnapshot;
  plan: PlanProposal;
  authority: AuthorityDecision;
  action: EngineAction;
  explanation: string;
  evidence: LearningEvidence[];
  facts: string[];
};
