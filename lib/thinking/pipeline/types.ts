// lib/thinking/pipeline/types.ts
//
// Types for Thinking Engine V2 evidence-based observation pipeline.

import type { Confidence, CompletedTaskFacts } from '../types';

export type ObservationType =
  | 'estimate_calibration'
  | 'repeated_carryover'
  | 'time_of_day'
  | 'task_context'
  | 'cluster_pattern';

export type EvidenceItem = {
  label: string;
  metricName: string;
  metricValue: number | string;
  sampleCount: number;
};

export type EngineObservation = {
  id: string;
  type: ObservationType;
  title: string;
  statement: string;
  explanation: string;
  evidence: {
    sampleCount: number;
    consistencyRatio: number; // 0.0 to 1.0
    supportingData: EvidenceItem[];
    lastObservedAt: string; // ISO string
  };
  confidence: Confidence;
  clusterLabel?: string;
  createdAt: string;
  status: 'active' | 'stale';
};

export type DetectorContext = {
  facts: CompletedTaskFacts[];
  clusters: Array<{
    label: string;
    tokens: Set<string>;
    count: number;
    totalMins: number;
    avgMins: number;
    location: { text: string; lat: number; lng: number } | null;
  }>;
  groupedFacts: Map<string, CompletedTaskFacts[]>;
  now?: Date;
};
