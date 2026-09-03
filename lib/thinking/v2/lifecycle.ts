import { CompletedTaskFacts } from '../types';
import { toLocalDate, localDateDiffDays } from './timezone';
import { emitProportionObservation } from './proportion';
import { StructuredObservation } from './observations';

/**
 * Lifecycle detector (V2).
 *
 * Observes how completed tasks move through their lifecycle in LOCAL calendar
 * days: how many clear the same day they were created, and how long late ones
 * typically take.
 *
 * Compared to the weak V1 `taskLifecycle` (which compared raw UTC strings and
 * reported an unanchored mean), this V2 version:
 *   - Uses local calendar dates via the V2 timezone layer (DST-safe).
 *   - Uses a legitimate same-day baseline (tasks are not inherently expected
 *     to clear the same day; the baseline is 50%).
 *   - Only counts tasks with valid created + completed timestamps — invalid
 *     dates are treated as missing data and never fabricated.
 *   - Effect magnitude and consistency are derived, not just a raw mean.
 */

const SAME_DAY_BASELINE = 0.5;

export function observeV2Lifecycle(
  tasks: CompletedTaskFacts[],
  tz: string = 'UTC',
): StructuredObservation[] {
  const out: StructuredObservation[] = [];
  if (tasks.length === 0) return [];

  // Only completed tasks with both dates resolvable in the local timezone.
  const valid = tasks.filter((t) => {
    if (!t.completed_at) return false;
    const c = toLocalDate(t.created_at, tz);
    const done = toLocalDate(t.completed_at!, tz);
    return c !== null && done !== null;
  });

  const total = valid.length;
  if (total === 0) return [];

  const missingTimestamps = tasks.length - valid.length;

  let sameDayCount = 0;
  const dayDiffs: number[] = [];
  for (const t of valid) {
    const created = toLocalDate(t.created_at, tz)!;
    const completed = toLocalDate(t.completed_at!, tz)!;
    const diff = localDateDiffDays(created, completed);
    if (diff === null) continue;
    if (diff === 0) sameDayCount++;
    else dayDiffs.push(diff);
  }

  const obs = emitProportionObservation({
    type: 'lifecycle',
    semanticType: 'lifecycle:same_day',
    title: 'Tasks often clear the same day',
    description:
      `Of ${total} completed tasks with valid dates, ${sameDayCount} (${Math.round((sameDayCount / total) * 100)}%) were completed on the day they were created. ` +
      (dayDiffs.length > 0
        ? `${dayDiffs.length} took ${Math.round(dayDiffs.reduce((a, b) => a + b, 0) / dayDiffs.length)} day(s) on average to complete.`
        : 'The remainder were completed on a later day.'),
    count: sameDayCount,
    total,
    baseline: SAME_DAY_BASELINE,
    missingDataCount: missingTimestamps,
    traceability: {
      taskIds: [],
      taskTexts: valid.map((t) => t.text),
      detectionSource: 'lifecycle.sameDay',
    },
  });
  if (obs) out.push(obs);

  return out;
}
