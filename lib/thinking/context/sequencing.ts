// lib/thinking/context/sequencing.ts
//
// Factual sequential relationships between a specific task and its
// immediate neighbours on the same day. Uses the existing Scope 3A
// buildAdjacencyPairs() primitive. Answers "what came before/after?"
// without inferring workflow structure.

import type { CompletedTaskFacts } from '../types';
import type { SequentialRelationship } from './types';
import { buildAdjacencyPairs } from '../relationships/sequencing';

/**
 * Find the task(s) that immediately preceded and followed
 * this task on the same UTC calendar day.
 *
 * Uses buildAdjacencyPairs from Scope 3A to determine
 * same-day consecutive ordering.
 *
 * Returns:
 * - preceding: at most one task (the immediate predecessor)
 * - following: at most one task (the immediate successor)
 *
 * Both are empty if the task has no valid created_at,
 * or is the only task on its day.
 *
 * This is a factual query. It does not infer workflow structure
 * from the adjacency.
 */
export function findSequenceContext(
  task: CompletedTaskFacts,
  allTasks: CompletedTaskFacts[]
): { preceding: SequentialRelationship[]; following: SequentialRelationship[] } {
  if (task.created_at == null) {
    return { preceding: [], following: [] };
  }
  if (Number.isNaN(new Date(task.created_at).getTime())) {
    return { preceding: [], following: [] };
  }

  const pairs = buildAdjacencyPairs(allTasks);
  const taskText = task.text;

  const preceding: SequentialRelationship[] = [];
  const following: SequentialRelationship[] = [];

  for (const pair of pairs) {
    if (pair.following === taskText) {
      // Find the actual task object for the preceding task
      const precedingTask = allTasks.find(
        (t) => t.text === pair.preceding && t.created_at != null
      );
      if (precedingTask) {
        preceding.push({
          task: precedingTask,
          gapMinutes: pair.gapMinutes,
        });
      }
    }

    if (pair.preceding === taskText) {
      // Find the actual task object for the following task
      const followingTask = allTasks.find(
        (t) => t.text === pair.following && t.created_at != null
      );
      if (followingTask) {
        following.push({
          task: followingTask,
          gapMinutes: pair.gapMinutes,
        });
      }
    }
  }

  return { preceding, following };
}
