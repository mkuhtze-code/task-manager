/**
 * Interaction contract types — shared by processInteraction and answer path.
 */

import type {
  EngineAction,
  EngineCycleResult,
  EngineRequest,
  LearningEvidence,
  WorkingMemorySnapshot,
  AuthorityDecision,
  Confidence,
} from './types';
import type { DeferredIntention } from './deferredIntention';
import type { Decision, DecisionTrace } from '@/lib/thinking/v3/types';

export type InteractionInputType = 'text' | 'speech_transcript' | 'structured';

export type InteractionInput = {
  userId: string | null;
  input: {
    type: InteractionInputType;
    text: string;
    confidence?: Confidence;
  };
  context: {
    /** e.g. 'capture' | 'today' | 'jobs' | 'voice' */
    interface: string;
    activity?: string | null;
    surface?: string | null;
    currentFocus?: {
      kind: 'task' | 'job' | 'list' | 'meeting' | 'request' | 'none';
      id: string | null;
      label: string | null;
    } | null;
    jobs?: Array<{ id: string; name: string; locationText?: string | null }>;
    meetings?: Array<{ id: string; text: string; startAt?: string | null }>;
    remainingMinsToday?: number | null;
    openTaskCount?: number;
    todayDate?: string;
    visitDurationMins?: number | null;
    travelMins?: number | null;
  };
  priorRequest?: EngineRequest | null;
  workingMemory?: WorkingMemorySnapshot;
  dryRun?: boolean;
};

export type InteractionOutcomeKind = 'ACT' | 'ANSWER' | 'DEFER' | 'CLARIFY' | 'NO_OP';

export type InteractionAnswer = {
  text: string;
  fits: boolean | null;
  evidence: string[];
  confidence: Confidence;
  /** V3 FitState when decideTaskFit was consulted. */
  fitState?: string | null;
  /** Authoritative DecisionTrace (reuse V3 — do not invent a second trace). */
  decision?: Decision | null;
  decisionTrace?: DecisionTrace | null;
};

export type InteractionResult = {
  outcome: InteractionOutcomeKind;
  message: string;
  action: EngineAction | null;
  answer: InteractionAnswer | null;
  deferred: DeferredIntention | null;
  clarify: {
    question: string;
    candidates: Array<{ id: string; label: string; kind: string }>;
  } | null;
  request: EngineRequest;
  workingMemory: WorkingMemorySnapshot;
  authority: AuthorityDecision;
  evidence: LearningEvidence[];
  facts: string[];
  explanation: string;
  cycle: EngineCycleResult | null;
  confidence: Confidence;
  /** V3 Decision when fit was consulted (ACT and ANSWER). */
  decision?: Decision | null;
  decisionTrace?: DecisionTrace | null;
  fitState?: string | null;
};
