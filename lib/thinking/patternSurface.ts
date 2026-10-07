/**
 * Presentation model for the Patterns surface.
 * Maps authoritative thinking-engine observations → human claims.
 * Does not recalculate intelligence — only frames it for denser visualisation.
 */

import type { StructuredObservation } from '@/lib/thinking/v2/observations';
import type { Confidence } from '@/lib/thinking/types';
import type { ConfidenceDimensions, ContradictionStatus } from '@/lib/thinking/v2/evidence';

export type PatternConfidenceLabel =
  | 'Well established'
  | 'Taking shape'
  | 'Early signal';

export type PatternBucket = 'established' | 'emerging' | 'changing';

/** Compact visual payload derived from evidence.measurements + dims. */
export type PatternVisual = {
  /** sample / effect / consistency strengths for the 3-segment indicator */
  dims: ConfidenceDimensions;
  effectMagnitude: number | null;
  consistency: number | null;
  recencyDays: number | null;
  contradictionStatus: ContradictionStatus;
  /** Estimate calibration */
  directionBias: 'over' | 'under' | 'balanced' | null;
  medianRatio: number | null;
  /** Rate-style observations (carry, lifecycle, temporal rates) — 0..1 */
  proportion: number | null;
  proportionLabel: string | null;
  /** Time-of-day / completion-period distribution */
  periods: { label: string; ratio: number }[] | null;
};

export type PatternCard = {
  id: string;
  statement: string;
  detail: string | null;
  sampleSize: number;
  confidence: Confidence;
  confidenceLabel: PatternConfidenceLabel;
  confidenceDetail: string;
  staleness: 'current' | 'stale';
  consequence: string;
  bucket: PatternBucket;
  type: string;
  semanticType: string;
  clusterLabel: string | null;
  location: string | null;
  medianMins: number | null;
  visual: PatternVisual;
};

export type RecurringWorkItem = {
  id: string;
  label: string;
  sampleSize: number;
  medianMins: number | null;
  confidence: Confidence;
  location: string | null;
  /** 0..1 strength relative to the strongest cluster in the set */
  relativeStrength: number;
};

export type ModelStatus = {
  completedTasks: number;
  establishedCount: number;
  emergingCount: number;
  evidenceWindowDays: number | null;
};

export type PatternSurfaceModel = {
  established: PatternCard[];
  emerging: PatternCard[];
  recurringWork: RecurringWorkItem[];
  modelStatus: ModelStatus;
};

function confidenceLabel(
  confidence: Confidence,
  sampleSize: number
): PatternConfidenceLabel {
  if (confidence === 'high' || sampleSize >= 7) return 'Well established';
  if (confidence === 'medium' || sampleSize >= 4) return 'Taking shape';
  return 'Early signal';
}

function confidenceDetail(
  label: PatternConfidenceLabel,
  sampleSize: number
): string {
  if (label === 'Well established') {
    return sampleSize > 0
      ? `Seen consistently across ${sampleSize} similar tasks.`
      : 'Seen consistently enough to rely on.';
  }
  if (label === 'Taking shape') {
    return sampleSize > 0
      ? `Seen ${sampleSize} times so far.`
      : 'Evidence is building.';
  }
  return sampleSize > 0
    ? `Only ${sampleSize} example${sampleSize === 1 ? '' : 's'}. Dokkit isn't relying on this strongly yet.`
    : "Not enough examples yet. Dokkit isn't relying on this strongly.";
}

function consequenceFor(obs: StructuredObservation): string {
  const t = `${obs.type} ${obs.semanticType}`.toLowerCase();
  if (t.includes('estimate') || t.includes('calibration') || t.includes('duration')) {
    return 'Dokkit uses this when estimating similar work and judging what fits into Today.';
  }
  if (t.includes('carry')) {
    return 'Dokkit uses this when interpreting work that runs past a single day.';
  }
  if (t.includes('time_of_day') || t.includes('temporal')) {
    return 'Dokkit uses this when reading when this kind of work tends to show up.';
  }
  if (t.includes('lifecycle') || t.includes('stale')) {
    return 'Dokkit uses this when recognising work that tends to sit open.';
  }
  if (t.includes('cluster') || t.includes('context')) {
    return 'Dokkit uses this when recognising similar work and suggesting context at capture.';
  }
  if (t.includes('planning') || t.includes('came_up') || t.includes('source')) {
    return 'Dokkit keeps capture light because much of this work arrives in the day rather than being planned in advance.';
  }
  return 'Dokkit holds this as background understanding of how your work behaves.';
}

function medianFromEvidence(obs: StructuredObservation): number | null {
  for (const m of obs.evidence.measurements ?? []) {
    const rec = m as { medianMins?: number; typicalMins?: number };
    if (typeof rec.medianMins === 'number' && rec.medianMins > 0) return rec.medianMins;
    if (typeof rec.typicalMins === 'number' && rec.typicalMins > 0) return rec.typicalMins;
  }
  return null;
}

function extractVisual(obs: StructuredObservation): PatternVisual {
  const dims = obs.confidenceDimensions ?? {
    sampleStrength: 'low' as Confidence,
    effectStrength: 'low' as Confidence,
    consistencyStrength: 'low' as Confidence,
  };

  let directionBias: PatternVisual['directionBias'] = null;
  let medianRatio: number | null = null;
  let proportion: number | null = null;
  let proportionLabel: string | null = null;
  let periods: PatternVisual['periods'] = null;

  for (const raw of obs.evidence.measurements ?? []) {
    const m = raw as Record<string, unknown>;

    if (typeof m.medianRatio === 'number') {
      medianRatio = m.medianRatio;
      if (m.directionBias === 'over' || m.directionBias === 'under' || m.directionBias === 'balanced') {
        directionBias = m.directionBias;
      }
    }

    if (typeof m.period === 'string' && typeof m.ratio === 'number') {
      periods = periods ?? [];
      periods.push({ label: String(m.period), ratio: m.ratio });
    }

    // Temporal / carry style: lateCount / total, or explicit rate fields
    if (typeof m.lateCount === 'number' && typeof m.total === 'number' && m.total > 0) {
      proportion = m.lateCount / m.total;
      proportionLabel = 'later than planned';
    }
  }

  // Fall back to effectMagnitude as a rate when no explicit proportion
  if (proportion === null && obs.evidence.effectMagnitude != null) {
    const t = `${obs.type} ${obs.semanticType}`.toLowerCase();
    if (t.includes('carry') || t.includes('lifecycle') || t.includes('overnight') || t.includes('staleness') || t.includes('proportion')) {
      proportion = Math.min(1, Math.max(0, obs.evidence.effectMagnitude));
      if (t.includes('carry')) proportionLabel = 'carries forward';
      else if (t.includes('overnight')) proportionLabel = 'spans nights';
      else if (t.includes('lifecycle') || t.includes('same_day')) proportionLabel = 'same-day finish';
      else if (t.includes('stale')) proportionLabel = 'goes stale';
      else proportionLabel = 'rate';
    }
  }

  if (periods && periods.length > 0) {
    periods.sort((a, b) => b.ratio - a.ratio);
  }

  return {
    dims,
    effectMagnitude: obs.evidence.effectMagnitude,
    consistency: obs.evidence.consistency,
    recencyDays: obs.recency ?? obs.evidence.recency,
    contradictionStatus: obs.contradictionStatus ?? 'none',
    directionBias,
    medianRatio,
    proportion,
    proportionLabel,
    periods,
  };
}

function bucketFor(obs: StructuredObservation): PatternBucket {
  const n = obs.evidence.sampleSize ?? 0;
  if (obs.confidence === 'high' || (obs.confidence === 'medium' && n >= 5)) {
    return 'established';
  }
  return 'emerging';
}

export function observationToPatternCard(obs: StructuredObservation): PatternCard {
  const sampleSize = obs.evidence.sampleSize ?? 0;
  const label = confidenceLabel(obs.confidence, sampleSize);
  const statement = (obs.title || obs.description || 'Pattern').trim();
  const detail =
    obs.description && obs.description.trim() !== statement
      ? obs.description.trim()
      : null;

  return {
    id: obs.id,
    statement,
    detail,
    sampleSize,
    confidence: obs.confidence,
    confidenceLabel: label,
    confidenceDetail: confidenceDetail(label, sampleSize),
    staleness: obs.staleness,
    consequence:
      label === 'Early signal'
        ? "Not used strongly yet — evidence is still developing."
        : consequenceFor(obs),
    bucket: bucketFor(obs),
    type: obs.type,
    semanticType: obs.semanticType ?? '',
    clusterLabel: obs.affectedContext.clusterLabel ?? null,
    location: obs.affectedContext.location ?? null,
    medianMins: medianFromEvidence(obs),
    visual: extractVisual(obs),
  };
}

export function buildPatternSurfaceModel(params: {
  actionable: StructuredObservation[];
  clusterObservations: StructuredObservation[];
  completedTasks: number;
  evidenceWindowDays?: number | null;
}): PatternSurfaceModel {
  const cards = params.actionable
    .filter((o) => o.staleness !== 'stale')
    .map(observationToPatternCard);

  const established = cards.filter((c) => c.bucket === 'established').slice(0, 5);
  const emerging = cards
    .filter((c) => c.bucket === 'emerging')
    .slice(0, 4);

  const byCluster = new Map<string, RecurringWorkItem>();
  for (const obs of params.clusterObservations) {
    if (obs.type !== 'cluster' && !obs.type.includes('cluster')) continue;
    const label = obs.affectedContext.clusterLabel ?? obs.title;
    if (!label) continue;
    const sampleSize = obs.evidence.sampleSize ?? 0;
    if (sampleSize < 2) continue;
    const existing = byCluster.get(label);
    const medianMins = medianFromEvidence(obs);
    if (!existing || sampleSize > existing.sampleSize) {
      byCluster.set(label, {
        id: obs.id,
        label,
        sampleSize,
        medianMins,
        confidence: obs.confidence,
        location: obs.affectedContext.location ?? null,
        relativeStrength: 0,
      });
    }
  }

  const recurringRaw = [...byCluster.values()].sort(
    (a, b) => b.sampleSize - a.sampleSize
  );
  const maxN = recurringRaw[0]?.sampleSize ?? 1;
  const recurringWork = recurringRaw.slice(0, 8).map((item) => ({
    ...item,
    relativeStrength: item.sampleSize / maxN,
  }));

  return {
    established,
    emerging,
    recurringWork,
    modelStatus: {
      completedTasks: params.completedTasks,
      establishedCount: established.length,
      emergingCount: emerging.length,
      evidenceWindowDays: params.evidenceWindowDays ?? null,
    },
  };
}
