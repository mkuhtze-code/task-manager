import { CompletedTaskFacts } from '../types';
import { toLocalDate, localDateDiffDays } from './timezone';
import { buildEvidence, deriveConfidenceDimensions, deriveConfidence } from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';

export type CarryoverKind = 'none' | 'single' | 'repeated';

export interface CarryoverResult {
  kind: CarryoverKind;
  intendedDate: string | null;
  completedDate: string | null;
  daysOverdue: number | null;
  previousIntendedDates: string[];
}

/**
 * A task has an explicit intended date when it carries a surface_date
 * (a scheduled commitment) OR was captured as a planned task (which implies
 * a commitment to do it on/around its creation date).
 */
function hasIntendedDate(task: CompletedTaskFacts): boolean {
  return task.source === 'planned';
}

export function detectCarryover(
  task: CompletedTaskFacts,
  allTasks: CompletedTaskFacts[],
  tz: string,
): CarryoverResult {
  const empty: CarryoverResult = {
    kind: 'none',
    intendedDate: null,
    completedDate: null,
    daysOverdue: null,
    previousIntendedDates: [],
  };

  if (!task.created_at || !task.completed_at) return empty;

  const completedLocal = toLocalDate(task.completed_at, tz);
  const createdLocal = toLocalDate(task.created_at, tz);
  if (!completedLocal || !createdLocal) return empty;

  // Determine the intended date.
  // A task intentionally scheduled for a future date (via surface_date) is
  // NOT automatically a carryover: its commitment is that future date.
  let intendedDate: string | null = null;
  const previousIntendedDates: string[] = [];

  if (task.surface_date) {
    const surfLocal = toLocalDate(task.surface_date, tz);
    if (surfLocal && surfLocal !== completedLocal) {
      intendedDate = surfLocal;
    }
  } else if (hasIntendedDate(task)) {
    intendedDate = createdLocal;
  }

  // No commitment date → cannot establish that the task was "carried over".
  if (!intendedDate) return empty;

  const overdueDays = localDateDiffDays(intendedDate, completedLocal);
  // Completed on or before its intended date → not carryover.
  if (overdueDays === null || overdueDays <= 0) return empty;

  // Find prior intended dates for the same task text in history. Multiple
  // distinct prior commitments establish "repeated" carryover.
  const sameTextTasks = allTasks.filter(
    (t) => t.text === task.text && t.created_at !== task.created_at,
  );
  for (const other of sameTextTasks) {
    if (!other.surface_date) continue;
    const otherSurfLocal = toLocalDate(other.surface_date, tz);
    if (otherSurfLocal && otherSurfLocal !== completedLocal) {
      previousIntendedDates.push(otherSurfLocal);
    }
  }

  const uniquePrevious = [...new Set(previousIntendedDates)].sort();
  const kind: CarryoverKind = uniquePrevious.length >= 1 ? 'repeated' : 'single';

  return {
    kind,
    intendedDate,
    completedDate: completedLocal,
    daysOverdue: overdueDays,
    previousIntendedDates: uniquePrevious,
  };
}

/**
 * Detect all carryover incidents across completed tasks. A task that was
 * intentionally scheduled for a later date is treated as carryover only if it
 * was completed after its intended date.
 */
export function detectAllCarryovers(
  tasks: CompletedTaskFacts[],
  tz: string,
): CarryoverResult[] {
  return tasks
    .filter((t) => t.completed_at)
    .map((t) => detectCarryover(t, tasks, tz))
    .filter((r) => r.kind !== 'none');
}

/**
 * Summarise the corpus into a single structured observation about repeated
 * carryover behaviour. Returns null when there is insufficient evidence.
 */
export function observeRepeatedCarryover(
  tasks: CompletedTaskFacts[],
  tz: string,
): StructuredObservation | null {

  const completed = tasks.filter((t) => t.completed_at);
  if (completed.length < 2) return null;

  const results = detectAllCarryovers(tasks, tz);
  const repeated = results.filter((r) => r.kind === 'repeated');
  const single = results.filter((r) => r.kind === 'single');

  if (repeated.length === 0 && single.length === 0) return null;

  const repeatedTasks = repeated.length;
  const evidence = buildEvidence({
    sampleSize: repeated.length + single.length,
    values: repeated.map((r) => r.daysOverdue ?? 0),
    measurements: [],
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'repeated_carryover',
    subType: repeated.length > 0 ? 'repeated' : 'single',
  });

  const description =
    repeated.length > 0
      ? `Across ${repeated.length + single.length} carried-over tasks, ${repeated.length} were carried over on multiple occasions. ` +
        `Median days past due: ${median(repeated.map((r) => r.daysOverdue ?? 0))}.`
      : `${single.length} tasks were completed after their intended date.`;

  return buildStructuredObservation({
    id,
    type: 'repeated_carryover',
    title: repeated.length > 0 ? 'Some tasks are repeatedly carried over' : 'Tasks are occasionally completed late',
    description,
    evidence,
    confidenceDimensions,
    confidence,
    affectedContext: {},
    traceability: {
      taskIds: [],
      taskTexts: tasks.filter((t) => t.completed_at).map((t) => t.text),
      detectionSource: 'repeatedCarryover',
    },
    semanticType: repeated.length > 0 ? 'carryover:repeated' : 'carryover:single',
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
