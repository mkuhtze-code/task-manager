/**
 * Dokkit CPU — universal orchestration contracts.
 *
 * Phase 1 is intentionally additive. Existing domain engines remain the
 * source of truth; the CPU provides the common language between them.
 *
 * No LLM. No new domain logic. No mutation is performed by these contracts.
 */

import type {
  Confidence,
  EngineAction,
  EngineRequest,
  LearningEvidence,
  ReasoningContext,
  WorkingMemorySnapshot,
} from '@/lib/engine';
import type {
  InteractionInput,
  InteractionResult,
} from '@/lib/engine/interactionTypes';
import type { ReconciledConflict, ReconciledOpportunity } from './reconcile/types';
import type { BeliefGraph } from './beliefs';

export type CpuBrainId =
  | 'speech'
  | 'tasks'
  | 'jobs'
  | 'meetings'
  | 'travel'
  | 'calendar'
  | 'location'
  | 'memory'
  | 'thinking'
  | 'learning'
  | 'authority';

export type CpuInterface =
  | 'capture'
  | 'today'
  | 'jobs'
  | 'meetings'
  | 'travel'
  | 'voice'
  | 'android'
  | 'android_auto'
  | 'unknown';

export type CpuInput = InteractionInput & {
  /**
   * Optional CPU metadata. Existing InteractionInput remains the canonical
   * input contract and is never mutated.
   */
  cpu?: {
    interface?: CpuInterface;
    requestId?: string | null;
    correlationId?: string | null;
  };
};

export type ContextEntity = {
  id: string;
  kind: 'task' | 'job' | 'meeting' | 'list' | 'trip' | 'location' | 'person' | 'request' | 'unknown';
  label: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SituationModel = {
  /** Canonical snapshot of the user's current situation for this CPU cycle. */
  version: 1;
  nowIso: string;
  userId: string | null;
  interface: CpuInterface;
  surface: string | null;
  activity: string | null;
  focus: InteractionInput['context']['currentFocus'] | null;
  request: EngineRequest;
  authority: InteractionResult['authority'];
  work: UniversalContext['work'];
  commitments: UniversalContext['commitments'];
  movement: UniversalContext['movement'];
  memory: UniversalContext['memory'];
  constraints: UniversalContext['constraints'];
  confidence: Confidence;
  beliefs: BeliefGraph;
};

export type UniversalContext = {
  /** Canonical cognitive state. Specialist brains should prefer this over parallel slices. */
  situation: SituationModel;
  beliefs: BeliefGraph;
  nowIso: string;
  interface: CpuInterface;
  activity: string | null;
  surface: string | null;
  currentFocus: InteractionInput['context']['currentFocus'] | null;

  user: { id: string | null };

  current: {
    interface: CpuInterface;
    surface: string | null;
    activity: string | null;
    focus: InteractionInput['context']['currentFocus'] | null;
  };

  work: {
    today: {
      date: string | null;
      remainingMins: number | null;
      openTaskCount: number;
    };
    tasks: { knownCount: number };
    jobs: { items: InteractionInput['context']['jobs'] };
  };

  commitments: {
    calendar: {
      available: boolean;
      commitments: InteractionInput['context']['meetings'];
    };
    meetings: { items: InteractionInput['context']['meetings'] };
  };

  movement: {
    location: {
      currentText: string | null;
      knownLocations: string[];
    };
    travel: ReasoningContext['travel'];
    route: { available: boolean };
  };

  collections: { lists: ContextEntity[] };

  memory: {
    working: WorkingMemorySnapshot;
    learned: ContextEntity[];
  };

  relationships: ContextEntity[];

  constraints: {
    remainingMinsToday: number | null;
    hasActiveTravel: boolean;
  };

  reasoning: ReasoningContext;
  interaction: InteractionInput['context'];
};

export type CpuObservation = {
  brain: CpuBrainId;
  kind:
    | 'fact'
    | 'constraint'
    | 'relationship'
    | 'suggestion'
    | 'conflict'
    | 'decision'
    | 'no_signal';
  value: string;
  confidence: Confidence;
  evidence?: string[];
  entityIds?: string[];
};

export type CpuRelationshipCandidate = {
  sourceId: string;
  targetId: string;
  relation:
    | 'related_to'
    | 'belongs_to'
    | 'located_at'
    | 'scheduled_for'
    | 'depends_on'
    | 'associated_with'
    | 'nearby'
    | 'possible_duplicate';
  confidence: Confidence;
  reason: string;
};

export type CpuBrainContribution = {
  brain: CpuBrainId;
  observations: CpuObservation[];
  relationships: CpuRelationshipCandidate[];
  evidence: LearningEvidence[];
};

export type CpuDecision = {
  /** The legacy interaction result remains authoritative in Phase 1. */
  outcome: InteractionResult['outcome'];
  message: string;
  action: EngineAction | null;
  request: EngineRequest;
  confidence: Confidence;
  observations: CpuObservation[];
  relationships: CpuRelationshipCandidate[];
  opportunities: ReconciledOpportunity[];
  rankedOpportunities: import('./reconcile/opportunityRanker').RankedOpportunity[];
  surfaceOpportunity: import('./reconcile/opportunityRanker').RankedOpportunity | null;
  conflicts: ReconciledConflict[];
  recommendedAction: EngineAction | null;
  authority: InteractionResult['authority'];
  explanation: string;
  evidence: LearningEvidence[];
  /** Existing result retained so callers can migrate incrementally. */
  interaction: InteractionResult;
};

export type CpuCycleResult = {
  context: UniversalContext;
  contributions: CpuBrainContribution[];
  decision: CpuDecision;
};

export type CpuBrain = {
  id: CpuBrainId;
  /**
   * Phase 1 brains are adapters around existing intelligence. Future phases
   * can replace individual adapters without changing the CPU contract.
   */
  contribute(
    input: CpuInput,
    context: UniversalContext,
    interaction: InteractionResult
  ): CpuBrainContribution;
};
