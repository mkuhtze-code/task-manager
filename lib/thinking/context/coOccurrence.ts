// lib/thinking/context/coOccurrence.ts
//
// Composition function for the contextual co-occurrence layer.
// Assembles factual relationships from spatial, temporal, and sequential
// queries into a single CoOccurrenceContext. This is a container —
// no interpretation, no scoring, no inference.

import type { CompletedTaskFacts } from '../types';
import type { CoOccurrenceContext } from './types';
import { findSpatialContext } from './spatial';
import { findSameDayContext } from './temporal';
import { findSequenceContext } from './sequencing';

/**
 * Query the complete contextual neighbourhood for a single task.
 *
 * Composes spatial, same-day, and sequential relationships
 * into a single factual result. No interpretation, no scoring,
 * no confidence. Each dimension is independently computed.
 *
 * The result answers: "What happened around this task?"
 * It must never answer: "What does that mean?"
 */
export function getCoOccurrenceContext(
  task: CompletedTaskFacts,
  allTasks: CompletedTaskFacts[]
): CoOccurrenceContext {
  const spatial = findSpatialContext(task, allTasks);
  const sameDay = findSameDayContext(task, allTasks);
  const { preceding, following } = findSequenceContext(task, allTasks);

  return {
    task,
    spatial,
    sameDay,
    preceding,
    following,
  };
}
