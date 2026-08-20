// lib/thinking/context/types.ts
//
// Factual relationship types for the contextual co-occurrence layer.
// These are pure data structures — no behaviour, no scoring, no interpretation.
// Each type answers a specific factual question about what happened around a task.

import type { CompletedTaskFacts } from '../types';

/**
 * A factual spatial relationship between two tasks.
 * Answers: "How far was Task B from Task A?"
 *
 * No relevance score. No confidence. No interpretation.
 * Just distance in metres and the other task.
 */
export type SpatialRelationship = {
  /** The other task that is within spatial proximity */
  task: CompletedTaskFacts;
  /** Exact Haversine distance in metres between the two tasks' coordinates */
  distanceMeters: number;
};

/**
 * A factual same-day relationship between two tasks.
 * Answers: "What else happened on the same UTC calendar day?"
 *
 * Reports the time gap but does not interpret whether
 * the gap is significant or whether the tasks are related.
 */
export type SameDayRelationship = {
  /** The other task that occurred on the same UTC calendar day */
  task: CompletedTaskFacts;
  /** Minutes between created_at values. Null if either timestamp is missing. */
  gapMinutes: number | null;
};

/**
 * A factual sequential relationship.
 * Answers: "What directly preceded/followed this task on the same day?"
 *
 * No workflow interpretation. No inference about task purpose.
 * Just the adjacent task and the time gap.
 */
export type SequentialRelationship = {
  /** The adjacent task (preceding or following) */
  task: CompletedTaskFacts;
  /** Minutes between created_at values. Null if either timestamp is missing. */
  gapMinutes: number | null;
};

/**
 * Complete contextual neighbourhood for a single task.
 * Contains raw factual relationships across all three dimensions.
 *
 * This is a container for factual results. It must NOT contain:
 * - inferred job
 * - inferred activity type
 * - inferred location type
 * - confidence score
 * - composite relationship score
 * - recommendation
 * - semantic label
 * - "likely related" boolean
 *
 * The function that produces this (getCoOccurrenceContext) is a composition
 * function only. It assembles the results of three independent queries.
 */
export type CoOccurrenceContext = {
  /** The task this context describes */
  task: CompletedTaskFacts;
  /** Tasks within spatial proximity (default: 50m threshold) */
  spatial: SpatialRelationship[];
  /** Other tasks on the same UTC calendar day */
  sameDay: SameDayRelationship[];
  /** Task that directly preceded this one on the same day */
  preceding: SequentialRelationship[];
  /** Task that directly followed this one on the same day */
  following: SequentialRelationship[];
};
