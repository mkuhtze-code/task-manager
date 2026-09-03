import { CompletedTaskFacts } from '../types';
import { toLocalDate, localDateDiffDays } from './timezone';
import { emitProportionObservation } from './proportion';
import { StructuredObservation } from './observations';

/**
 * Staleness detector (V2) — "completed after a stall".
 *
 * Because the V2 input contract is `CompletedTaskFacts[]` (completed tasks),
 * this detector observes how many completed tasks sat stale: completed well
 * after they were created (i.e. they stalled before completion). This is
 * distinct from CONTRADICTION — a stale observation is about age/recency,
 * not about conflicting recent evidence. See the evidence model's
 * StalenessStatus vs ContradictionStatus for the separation.
 *
 * Compared to the weak V1 `staleness` (which used `Date.now()` implicitly,
 * raw UTC slices, and a coarse 0/1 classification), this V2 version:
 *   - Uses local calendar dates and a configurable "now".
 *   - Uses a legitimate baseline for "clears quickly" vs "stalled".
 *   - Tracks missing timestamps as missing data and never fabricates.
 *   - Emits descriptive, non-causal wording.
 */

const STALL_THRESHOLD_DAYS = 3;
const STALLED_BASELINE = 0.5;

export function observeV2Staleness(
  tasks: CompletedTaskFacts[],
  tz: string = 'UTC',
): StructuredObservation[] {
  const out: StructuredObservation[] = [];
  if (tasks.length === 0) return out;

  const valid = tasks.filter((t) => {
    if (!t.completed_at) return false;
    const c = toLocalDate(t.created_at, tz);
    const d = toLocalDate(t.completed_at!, tz);
    return c !== null && d !== null;
  });

  const total = valid.length;
  if (total === 0) return [];

  const missingTimestamps = tasks.length - total;

  let stalledCount = 0;
  for (const t of valid) {
    const created = toLocalDate(t.created_at, tz)!;
    const completed = toLocalDate(t.completed_at!, tz)!;
    const diff = localDateDiffDays(created, completed);
    if (diff !== null && diff > STALL_THRESHOLD_DAYS) stalledCount++;
  }

  const obs = emitProportionObservation({
    type: 'staleness',
    semanticType: 'staleness:completed_after_stall',
    title: 'Some tasks sit for days before they are completed',
    description:
      `Of ${total} completed tasks with valid dates, ${stalledCount} (${Math.round((stalledCount / total) * 100)}%) were completed more than ${STALL_THRESHOLD_DAYS} days after they were created.`,
    count: stalledCount,
    total,
    baseline: STALLED_BASELINE,
    missingDataCount: missingTimestamps,
    traceability: {
      taskIds: [],
      taskTexts: valid.map((t) => t.text),
      detectionSource: 'staleness.completedAfterStall',
    },
  });
  if (obs) out.push(obs);

  return out;
}
