import { CompletedTaskFacts } from '../types';
import { toLocalHour } from './timezone';
import { buildEvidence, deriveConfidenceDimensions, deriveConfidence } from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';

const PERIOD_LABELS: Record<string, string> = {
  morning: 'morning (6am–12pm)',
  afternoon: 'afternoon (12pm–5pm)',
  evening: 'evening (5pm–9pm)',
  night: 'night (9pm–6am)',
};

type Period = 'morning' | 'afternoon' | 'evening' | 'night';
const PERIODS: Period[] = ['morning', 'afternoon', 'evening', 'night'];

function classifyPeriod(hour: number): Period {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function classifyLocalPeriod(iso: string, tz: string): Period | null {
  const hour = toLocalHour(iso, tz);
  if (hour === null) return null;
  return classifyPeriod(hour);
}

function countByPeriod(tasks: CompletedTaskFacts[], tz: string): Map<Period, number> {
  const counts = new Map<Period, number>();
  for (const p of PERIODS) counts.set(p, 0);
  for (const t of tasks) {
    if (!t.created_at) continue;
    const period = classifyLocalPeriod(t.created_at, tz);
    if (!period) continue;
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }
  return counts;
}

export function observeTimeOfDay(
  tasks: CompletedTaskFacts[],
  tz: string = 'UTC',
): StructuredObservation | null {
  const withTimestamp = tasks.filter((t) => t.created_at);
  if (withTimestamp.length < 3) return null;

  const counts = countByPeriod(withTimestamp, tz);
  const total = withTimestamp.length;

  const periodEntries = PERIODS
    .map((p) => ({ period: p, count: counts.get(p) ?? 0 }))
    .filter((e) => e.count > 0);

  if (periodEntries.length === 0) return null;

  let dominant = periodEntries[0];
  for (const e of periodEntries) {
    if (e.count > dominant.count) dominant = e;
  }

  const dominantRatio = dominant.count / total;
  const uniformRate = 1 / PERIODS.length;

  // Require a meaningful concentration above a uniform baseline. To claim
  // "tasks tend to happen in period X" the dominant period must account for
  // a clear majority relative to chance — otherwise we are just reporting
  // which bucket happened to win a near-tie.
  const effectMagnitude = Math.min((dominantRatio - uniformRate) / (1 - uniformRate), 1);
  if (effectMagnitude < 0.35) return null;

  const ratios = periodEntries.map((e) => e.count / total);
  const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const consistency = 1 - Math.sqrt(
    ratios.reduce((sum, r) => sum + (r - meanRatio) ** 2, 0) / ratios.length,
  );

  const evidence = buildEvidence({
    sampleSize: total,
    values: ratios,
    recencyDays: null,
    specificity: effectMagnitude,
    measurements: periodEntries.map((e) => ({
      period: e.period,
      count: e.count,
      ratio: e.count / total,
    })),
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'time_of_day',
    dimension: 'dominant_period',
    subType: dominant.period,
  });

  const description = periodEntries
    .map((e) => `${PERIOD_LABELS[e.period]}: ${e.count} tasks (${Math.round((e.count / total) * 100)}%)`)
    .join(', ');

  return buildStructuredObservation({
    id,
    type: 'time_of_day',
    title: `Tasks tend to be captured in the ${PERIOD_LABELS[dominant.period]}`,
    description: `Of ${total} tasks with timestamps, ${description}.`,
    evidence,
    confidenceDimensions,
    confidence,
    affectedContext: { timePeriod: dominant.period },
    traceability: {
      taskIds: [],
      taskTexts: withTimestamp.map((t) => t.text),
      detectionSource: 'timeOfDay',
    },
    semanticType: `time_of_day:${dominant.period}`,
  });
}
