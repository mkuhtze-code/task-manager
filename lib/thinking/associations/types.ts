// lib/thinking/associations/types.ts
//
// Type definitions for contextual associations. These are the outputs
// of Scope 3B — deterministic statistical patterns derived from facts
// and relationships. They answer "what tends to occur together?" without
// interpreting what it means.

import type { Confidence } from '../types';
import type { TimePeriod } from '../relationships/temporal';

// ── Cluster × Place ────────────────────────────────────────────────

export type ClusterPlaceAssociation = {
  kind: 'cluster_place';
  clusterLabel: string;
  locationText: string; // representative text for this place
  occurrenceCount: number; // tasks at this place with valid coordinates
  totalWithCoordinates: number; // tasks in cluster with valid coordinates
  totalInCluster: number; // all tasks in cluster
  ratio: number; // occurrenceCount / totalWithCoordinates
  confidence: Confidence;
};

// ── Cluster × Time ─────────────────────────────────────────────────

export type ClusterTimeAssociation = {
  kind: 'cluster_time';
  clusterLabel: string;
  dimension: 'period' | 'day_of_week';
  value: TimePeriod | string; // e.g. 'morning' or 'Mon'
  occurrenceCount: number;
  totalWithTimestamp: number; // tasks with valid created_at
  totalInCluster: number;
  ratio: number; // occurrenceCount / totalWithTimestamp
  confidence: Confidence;
};

// ── Cluster × Job ──────────────────────────────────────────────────
//
// Evidence dimensions are kept strictly independent.
// One task may appear in multiple dimensions simultaneously.
// The caller must not sum dimensions into a composite score.

export type ClusterJobEvidence = {
  direct: {
    count: number; // tasks with job_id = X
    total: number; // total tasks in cluster
  };
  spatial: {
    count: number; // unlinked tasks within 50m of job X activity
    total: number; // unlinked tasks with valid coordinates
  };
  temporal: {
    count: number; // unlinked tasks on same day as job X activity
    total: number; // unlinked tasks with valid created_at
  };
  sequence: {
    count: number; // unlinked tasks adjacent to job X activity
    total: number; // unlinked tasks with valid created_at
  };
};

export type ClusterJobAssociation = {
  kind: 'cluster_job';
  clusterLabel: string;
  jobId: string;
  evidence: ClusterJobEvidence;
  confidence: Confidence;
};

// ── Union ──────────────────────────────────────────────────────────

export type ClusterAssociation =
  | ClusterPlaceAssociation
  | ClusterTimeAssociation
  | ClusterJobAssociation;
