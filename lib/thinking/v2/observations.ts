import {
  Evidence,
  ConfidenceDimensions,
  StalenessStatus,
  ContradictionStatus,
} from './evidence';
import { Confidence } from '../types';

export interface Traceability {
  taskIds: string[];
  taskTexts: string[];
  detectionSource: string;
}

export interface StructuredObservation {
  id: string;
  type: string;
  title: string;
  description: string;
  evidence: Evidence;
  confidence: Confidence;
  confidenceDimensions: ConfidenceDimensions;
  supportingMeasurements: unknown[];
  affectedContext: {
    clusterLabel?: string;
    timePeriod?: string;
    location?: string;
    jobId?: string;
  };
  createdAt: string;
  observationTimestamp: string;
  recency: number | null;
  staleness: StalenessStatus;
  contradictionStatus: ContradictionStatus;
  traceability: Traceability;
  semanticType: string;
  rank: number;
}

export function buildStructuredObservation(params: {
  id: string;
  type: string;
  title: string;
  description: string;
  evidence: Evidence;
  confidenceDimensions: ConfidenceDimensions;
  confidence: Confidence;
  supportingMeasurements?: unknown[];
  affectedContext?: Partial<StructuredObservation['affectedContext']>;
  createdAt?: string;
  observationTimestamp?: string;
  recency?: number | null;
  staleness?: StalenessStatus;
  contradictionStatus?: ContradictionStatus;
  traceability: Traceability;
  semanticType: string;
  rank?: number;
}): StructuredObservation {
  const now = new Date().toISOString();
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    description: params.description,
    evidence: params.evidence,
    confidence: params.confidence,
    confidenceDimensions: params.confidenceDimensions,
    supportingMeasurements: params.supportingMeasurements ?? [],
    affectedContext: params.affectedContext ?? {},
    createdAt: params.createdAt ?? now,
    observationTimestamp: params.observationTimestamp ?? now,
    recency: params.recency ?? params.evidence.recency,
    staleness: params.staleness ?? 'current',
    contradictionStatus: params.contradictionStatus ?? 'none',
    traceability: params.traceability,
    semanticType: params.semanticType,
    rank: params.rank ?? 0,
  };
}
