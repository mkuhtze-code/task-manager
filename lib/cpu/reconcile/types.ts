import type { Confidence, EngineAction, EngineRequest, InteractionResult } from '@/lib/engine';
import type { CpuBrainContribution, CpuRelationshipCandidate, CpuObservation } from '../types';

export type ReconciledConflict = {
  kind: 'action' | 'schedule' | 'relationship' | 'authority' | 'context';
  message: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string[];
};

export type ReconciledOpportunity = {
  kind: 'spatial' | 'temporal' | 'job' | 'travel' | 'meeting' | 'dependency' | 'information' | 'person' | 'route' | 'memory';
  message: string;
  confidence: Confidence;
  entityIds: string[];
  reason: string;
};

export type ReconciledDecision = {
  primaryIntent: EngineRequest;
  relevantEntities: string[];
  relationships: CpuRelationshipCandidate[];
  opportunities: ReconciledOpportunity[];
  conflicts: ReconciledConflict[];
  recommendedAction: EngineAction | null;
  confidence: Confidence;
  authority: InteractionResult['authority'];
  explanation: string;
  interaction: InteractionResult;
  observations: CpuObservation[];
  evidence: InteractionResult['evidence'];
};

export type ReconciliationInput = {
  interaction: InteractionResult;
  contributions: CpuBrainContribution[];
};
