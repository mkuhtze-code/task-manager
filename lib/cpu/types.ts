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

export type UniversalContext = {
  nowIso: string;
  interface: CpuInterface;
  activity: string | null;
  surface: string | null;
  currentFocus: InteractionInput['context']['currentFocus'] | null;

  /** Existing engine context, preserved as the source of truth in Phase 1. */
  reasoning: ReasoningContext;

  /** Existing working memory snapshot. */
  workingMemory: WorkingMemorySnapshot;

  /** Original interaction context, retained for adapters that need fields not
   * yet promoted into ReasoningContext. */
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
