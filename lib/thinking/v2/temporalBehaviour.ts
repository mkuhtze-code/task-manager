import { CompletedTaskFacts } from '../types';
import {
  normalizeTemporalFacts,
  PERIOD_ORDER,
  Period,
  TemporalFacts,
} from './temporal';
import {
  emitProportionObservation,
  buildProportionEvidence,
} from './proportion';
import {
  buildEvidence,
  deriveConfidenceDimensions,
  deriveConfidence,
  median,
} from './evidence';
import { observationIdentityKey } from './identity';
import { buildStructuredObservation, StructuredObservation } from './observations';

const RATE_BASELINE = 0.5;
const UNIFORM_PERIOD_BASELINE = 1 / 4;
const PERIOD_LABELS: Record<Period, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};

const PERIODS: Period[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * Temporal-behaviour detector (V2.3).
 *
 * Learns how tasks move through time from ordinary task use — no duration
 * estimates and no Start/Stop required — and reports descriptive, repeated
 * temporal behaviours.
 *
 * Hard constraints honoured here:
 *   - taskLatency / scheduleDisplacement describe movement through time; they
 *     are NEVER reported as "how long the task took".
 *   - Active duration is only ever observed from Start/Stop evidence.
 *   - Time-of-day completion uses a legitimate uniform baseline (never "the
 *     largest bucket").
 *   - A zero/insufficient denominator or missing baseline never produces a
 *     fabricated observation; it is marked insufficient and not emitted.
 *   - Timezone: every grouping uses the user's IANA timezone (no getHours /
 *     getDay / UTC fallback on the running engine).
 *
 * The temporal view is normalised ONCE via normalizeTemporalFacts and reused
 * by every sub-observation — no rescan of the full task set per observation.
 */
export function observeV2TemporalBehaviour(
  tasks: CompletedTaskFacts[],
  tz: string = 'UTC',
): StructuredObservation[] {
  if (tasks.length === 0) return [];
  const facts = normalizeTemporalFacts(tasks, tz);
  const out: StructuredObservation[] = [];

  const overnight = observeOvernight(facts);
  if (overnight) out.push(overnight);

  const completionPeriod = observeCompletionPeriod(facts);
  if (completionPeriod) out.push(completionPeriod);

  const shiftLater = observeShiftLater(facts);
  if (shiftLater) out.push(shiftLater);

  const displacement = observeScheduleDisplacement(facts);
  if (displacement) out.push(displacement);

  const persistence = observePersistence(facts);
  if (persistence) out.push(persistence);

  return out;
}

/** P(completed on a later local date | eligible). Baseline 0.5. */
function observeOvernight(facts: TemporalFacts[]): StructuredObservation | null {
  const eligible = facts.filter(
    (f) => f.createdLocal !== null && f.completedLocal !== null && f.latencyDays !== null,
  );
  const total = eligible.length;
  const missing = facts.length - total;
  if (total === 0) return null;

  const overnightCount = eligible.filter((f) => f.latencyDays! > 0).length;

  return emitProportionObservation({
    type: 'temporal',
    semanticType: 'temporal:overnight',
    title: 'These tasks often carry into the next day',
    description:
      `Across ${total} completed tasks with valid dates, ${overnightCount} (${Math.round((overnightCount / total) * 100)}%) were completed on a later local date than they were added.`,
    count: overnightCount,
    total,
    baseline: RATE_BASELINE,
    missingDataCount: missing,
    evidenceKind: 'observation',
    traceability: {
      taskIds: [],
      taskTexts: eligible.map((f) => f.task.text),
      detectionSource: 'temporalBehaviour.overnight',
    },
  });
}

/** Dominant completion period vs a uniform baseline (never the largest bucket). */
function observeCompletionPeriod(facts: TemporalFacts[]): StructuredObservation | null {
  const eligible = facts.filter((f) => f.completedLocal !== null && f.completedPeriod !== null);
  const total = eligible.length;
  if (total < 3) return null;

  const counts = new Map<Period, number>();
  for (const p of PERIODS) counts.set(p, 0);
  for (const f of eligible) counts.set(f.completedPeriod!, (counts.get(f.completedPeriod!) ?? 0) + 1);

  let dominant: Period = 'morning';
  let dominantCount = 0;
  for (const p of PERIODS) {
    const c = counts.get(p) ?? 0;
    if (c > dominantCount) {
      dominant = p;
      dominantCount = c;
    }
  }

  const dominantRatio = dominantCount / total;
  const effectMagnitude = Math.min(
    (dominantRatio - UNIFORM_PERIOD_BASELINE) / (1 - UNIFORM_PERIOD_BASELINE),
    1,
  );
  if (effectMagnitude < 0.35) return null;

  const ratios = PERIODS.map((p) => (counts.get(p) ?? 0) / total);

  const evidence = buildEvidence({
    sampleSize: total,
    values: ratios,
    effectMagnitude,
    recencyDays: null,
    specificity: effectMagnitude,
    measurements: PERIODS.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => ({
      period: p,
      count: counts.get(p),
      ratio: (counts.get(p) ?? 0) / total,
    })),
    evidenceKind: 'observation',
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'temporal',
    dimension: 'completion_period',
    subType: dominant,
  });

  const sizeable = PERIODS.filter((p) => (counts.get(p) ?? 0) > 0)
    .map((p) => `${PERIOD_LABELS[p]}: ${counts.get(p)} (${Math.round(((counts.get(p) ?? 0) / total) * 100)}%)`)
    .join(', ');

  return buildStructuredObservation({
    id,
    type: 'temporal',
    title: `Tasks like this are commonly completed in the ${PERIOD_LABELS[dominant]}`,
    description: `Of ${total} completed tasks, completion times were ${sizeable}.`,
    evidence,
    confidenceDimensions,
    confidence,
    affectedContext: { timePeriod: dominant },
    traceability: {
      taskIds: [],
      taskTexts: eligible.map((f) => f.task.text),
      detectionSource: 'temporalBehaviour.completionPeriod',
    },
    semanticType: 'temporal:completion_period',
  });
}

/** P(completed later in the day than added). Baseline 0.5. */
function observeShiftLater(facts: TemporalFacts[]): StructuredObservation | null {
  const eligible = facts.filter(
    (f) => f.createdPeriod !== null && f.completedPeriod !== null,
  );
  const total = eligible.length;
  const missing = facts.filter((f) => f.createdPeriod === null || f.completedPeriod === null).length;
  if (total === 0) return null;

  const laterCount = eligible.filter(
    (f) => PERIOD_ORDER[f.completedPeriod!] > PERIOD_ORDER[f.createdPeriod!],
  ).length;

  return emitProportionObservation({
    type: 'temporal',
    semanticType: 'temporal:shift_later',
    title: 'Tasks added mid-day tend to be completed later in the day',
    description:
      `Across ${total} completed tasks with a known time of day, ${laterCount} (${Math.round((laterCount / total) * 100)}%) were completed in a later part of the day than when they were added.`,
    count: laterCount,
    total,
    baseline: RATE_BASELINE,
    missingDataCount: missing,
    evidenceKind: 'association',
    traceability: {
      taskIds: [],
      taskTexts: eligible.map((f) => f.task.text),
      detectionSource: 'temporalBehaviour.shiftLater',
    },
  });
}

/** Schedule displacement where an intended time exists. NOT task duration. */
function observeScheduleDisplacement(facts: TemporalFacts[]): StructuredObservation | null {
  const eligible = facts.filter(
    (f) => f.intendedLocal !== null && f.completedLocal !== null && f.displacementDays !== null,
  );
  if (eligible.length < 3) return null;

  const displacements = eligible.map((f) => f.displacementDays!);
  const lateCount = displacements.filter((d) => d > 0).length;
  const shareLate = lateCount / eligible.length;
  const effect = Math.min(Math.abs(shareLate - RATE_BASELINE) / RATE_BASELINE, 1);
  if (effect < 0.3) return null;

  const medianDisplacement = median(displacements);
  if (medianDisplacement === null) return null;

  const direction =
    medianDisplacement > 0
      ? 'after'
      : medianDisplacement < 0
        ? 'before'
        : 'on';

  const evidence = buildEvidence({
    sampleSize: eligible.length,
    values: displacements,
    effectMagnitude: effect,
    recencyDays: null,
    measurements: [{ lateCount, total: eligible.length, medianDisplacementDays: medianDisplacement }],
    evidenceKind: 'derived_measurement',
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'temporal',
    dimension: 'schedule_displacement',
    subType: direction,
  });

  const sign = medianDisplacement > 0 ? 'after' : medianDisplacement < 0 ? 'before' : 'on schedule';

  return buildStructuredObservation({
    id,
    type: 'temporal',
    title: `Tasks are often completed ${sign} their intended day`,
    description:
      `Across ${eligible.length} tasks with a scheduled day, the typical completion lands ${Math.abs(medianDisplacement)} day(s) ${sign} the intended day. This measures movement through time, not how long any task took.`,
    evidence,
    confidenceDimensions,
    confidence,
    traceability: {
      taskIds: [],
      taskTexts: eligible.map((f) => f.task.text),
      detectionSource: 'temporalBehaviour.scheduleDisplacement',
    },
    semanticType: `temporal:schedule_displacement:${direction}`,
  });
}

/** Persistence: how many local dates tasks that carry over typically span. */
function observePersistence(facts: TemporalFacts[]): StructuredObservation | null {
  const persisting = facts.filter(
    (f) => f.persistenceDates !== null && f.persistenceDates > 1,
  );
  if (persisting.length < 3) return null;

  const spans = persisting.map((f) => f.persistenceDates!);
  const medianSpan = median(spans);
  if (medianSpan === null) return null;

  const evidence = buildEvidence({
    sampleSize: persisting.length,
    values: spans,
    effectMagnitude: null,
    recencyDays: null,
    measurements: [{ typicalSpanDates: medianSpan }],
    evidenceKind: 'observation',
  });

  const confidenceDimensions = deriveConfidenceDimensions(evidence);
  const confidence = deriveConfidence(confidenceDimensions);

  const id = observationIdentityKey({
    type: 'temporal',
    dimension: 'persistence',
  });

  const plural = Math.round(medianSpan) === 1 ? 'day' : 'days';

  return buildStructuredObservation({
    id,
    type: 'temporal',
    title: 'Tasks that carry over typically span multiple days',
    description:
      `Across ${persisting.length} tasks completed on a later day, they typically stayed active across about ${Math.round(medianSpan)} local ${plural}. This describes persistence of a task over time, not how long the work took.`,
    evidence,
    confidenceDimensions,
    confidence,
    traceability: {
      taskIds: [],
      taskTexts: persisting.map((f) => f.task.text),
      detectionSource: 'temporalBehaviour.persistence',
    },
    semanticType: 'temporal:persistence',
  });
}
