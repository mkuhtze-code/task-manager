// lib/thinking/v3/model.ts
//
// Phase 4 — personal model: hierarchical duration, maturity, ModelState.
//
// Hierarchy (most specific first):
//   cluster (matched) → user median → onboarding prior → system default
//
// Shrinkage blends sparse cluster evidence toward the next wider level.
// Pure. Deterministic. Pass updatedAt explicitly.

import {
  buildClusterModels,
  matchCluster,
  userDurationFromClusters,
  personalMedianMins,
  type ClusterModel,
  type HistorySample,
  CLUSTER_MATCH_THRESHOLD,
} from './clusters';
import {
  shrinkTowardPrior,
  durationFromSamples,
  median,
} from './stats';
import type {
  Authority,
  Belief,
  ConfidenceProfile,
  DurationDistribution,
  LearningPhase,
  ModelMaturity,
  ModelState,
} from './types';
import {
  MODEL_VERSION,
  ALGORITHM_VERSION,
  FEATURE_VERSION,
} from './types';

export const SYSTEM_DEFAULT_MINS = 30;
export const DEFAULT_PRIOR_STRENGTH = 3;
export const CLUSTER_MIN_SAMPLES_FOR_AUTHORITY = 2;

export type PersonalModelPriors = {
  softFloorMins: number;
  anchorSameDayRate: number;
  flexibleSameDayRate: number;
  blendScale: number;
  priorStrength?: number;
};

export type ClosedOutcomeSample = {
  predictedMins: number;
  actualMins: number;
};

export type PersonalModel = {
  userId: string;
  clusters: ClusterModel[];
  userDuration: DurationDistribution | null;
  personalMedianMins: number | null;
  beliefs: Belief[];
  state: ModelState;
  matchThreshold: number;
};

export type HierarchicalDuration = {
  distribution: DurationDistribution;
  level: 'cluster' | 'user' | 'onboarding' | 'system';
  clusterId: string | null;
  clusterLabel: string | null;
  matchScore: number | null;
  authority: Authority;
  confidence: ConfidenceProfile;
  reasons: string[];
};

export type SameDayLookup = {
  rate: number | null;
  samples: number;
  clusterId: string | null;
  clusterLabel: string | null;
  level: 'cluster' | 'prior' | 'unknown';
};

function confidenceFromSamples(
  sampleSize: number,
  consistency: number | null
): ConfidenceProfile {
  const sampleStrength: ConfidenceProfile['sampleStrength'] =
    sampleSize >= 7 ? 'high' : sampleSize >= 3 ? 'medium' : 'low';
  const consistencyStrength: ConfidenceProfile['consistencyStrength'] =
    consistency == null
      ? 'low'
      : consistency >= 0.75
        ? 'high'
        : consistency >= 0.5
          ? 'medium'
          : 'low';
  const overall: ConfidenceProfile['overall'] =
    sampleStrength === 'high' && consistencyStrength !== 'low'
      ? 'high'
      : sampleStrength === 'low'
        ? 'low'
        : 'medium';
  return {
    overall,
    sampleStrength,
    effectStrength: overall,
    consistencyStrength,
    recencyWeight: null,
    specificity: sampleSize >= 3 ? 0.7 : 0.3,
    contradiction: 'none',
    staleness: 'current',
  };
}

function authorityFromSamples(sampleSize: number): Authority {
  if (sampleSize >= 7) return 'strong';
  if (sampleSize >= CLUSTER_MIN_SAMPLES_FOR_AUTHORITY) return 'suggest';
  return 'observe';
}

export function learningPhaseFromClosedCount(closedSampleCount: number): LearningPhase {
  if (closedSampleCount < 2) return 'prior';
  if (closedSampleCount < 4) return 'early';
  if (closedSampleCount < 5) return 'forming';
  return 'established';
}

export function maturityFromEvidence(params: {
  closedSampleCount: number;
  clusterCount: number;
  clustersWithDuration: number;
  meanConsistency: number | null;
}): ModelMaturity {
  const { closedSampleCount, clusterCount, clustersWithDuration, meanConsistency } =
    params;

  if (closedSampleCount === 0 && clustersWithDuration === 0) return 'cold';
  if (closedSampleCount < 2 && clustersWithDuration < 2) return 'warming';
  if (closedSampleCount < 5 || clustersWithDuration < 3) return 'forming';

  if (
    meanConsistency != null &&
    meanConsistency < 0.35 &&
    closedSampleCount >= 5
  ) {
    return 'uncertain';
  }

  if (clusterCount >= 3 && clustersWithDuration >= 3 && closedSampleCount >= 5) {
    return 'stable';
  }
  return 'forming';
}

function calibrationFromClosed(closed: ClosedOutcomeSample[]): {
  durationBias: number | null;
  durationMae: number | null;
  explain: string | null;
} {
  if (closed.length === 0) {
    return { durationBias: null, durationMae: null, explain: null };
  }
  const ratios = closed
    .filter((c) => c.predictedMins > 0 && c.actualMins > 0)
    .map((c) => c.actualMins / c.predictedMins);
  const errors = closed
    .filter((c) => c.predictedMins > 0)
    .map((c) => Math.abs(c.actualMins - c.predictedMins));

  if (ratios.length === 0) {
    return { durationBias: null, durationMae: null, explain: null };
  }

  const sorted = [...ratios].sort((a, b) => a - b);
  const bias = median(sorted);
  const mae =
    errors.length > 0
      ? errors.reduce((a, b) => a + b, 0) / errors.length
      : null;

  let explain: string | null = null;
  if (bias != null && closed.length >= 4) {
    const pct = Math.round(bias * 100);
    if (bias > 1.05) {
      explain = `Learned times have been ~${pct - 100}% short — leaning more on history`;
    } else if (bias < 0.95) {
      explain = `Learned times have been ~${100 - pct}% long — leaning less on history`;
    }
  }

  return {
    durationBias: bias,
    durationMae: mae == null ? null : Math.round(mae),
    explain,
  };
}

function durationBeliefsFromClusters(
  clusters: ClusterModel[],
  updatedAt: string
): Belief[] {
  const beliefs: Belief[] = [];
  for (const c of clusters) {
    if (!c.duration) continue;
    beliefs.push({
      beliefId: `belief_duration_${c.clusterId}`,
      dimension: 'duration',
      subject: {
        clusterLabel: c.label,
        clusterId: c.clusterId,
        jobId: null,
        locationKey: null,
        userWide: false,
      },
      value: c.duration,
      confidence: confidenceFromSamples(c.durationSamples.length, c.consistency),
      authority: authorityFromSamples(c.durationSamples.length),
      evidenceIds: [],
      origin: 'observed',
      modelVersion: MODEL_VERSION,
      updatedAt,
    });
    if (c.sameDayRate != null && c.sameDaySamples >= 2) {
      beliefs.push({
        beliefId: `belief_sameday_${c.clusterId}`,
        dimension: 'same_day_rate',
        subject: {
          clusterLabel: c.label,
          clusterId: c.clusterId,
          jobId: null,
          locationKey: null,
          userWide: false,
        },
        value: c.sameDayRate,
        confidence: confidenceFromSamples(c.sameDaySamples, null),
        authority: authorityFromSamples(c.sameDaySamples),
        evidenceIds: [],
        origin: 'observed',
        modelVersion: MODEL_VERSION,
        updatedAt,
      });
    }
  }
  return beliefs;
}

export function buildPersonalModel(params: {
  userId: string;
  samples: HistorySample[];
  priors?: Partial<PersonalModelPriors>;
  closedOutcomes?: ClosedOutcomeSample[];
  updatedAt: string;
  matchThreshold?: number;
}): PersonalModel {
  const priors: PersonalModelPriors = {
    softFloorMins: params.priors?.softFloorMins ?? SYSTEM_DEFAULT_MINS,
    anchorSameDayRate: params.priors?.anchorSameDayRate ?? 0.55,
    flexibleSameDayRate: params.priors?.flexibleSameDayRate ?? 0.4,
    blendScale: params.priors?.blendScale ?? 1,
    priorStrength: params.priors?.priorStrength ?? DEFAULT_PRIOR_STRENGTH,
  };

  const matchThreshold = params.matchThreshold ?? CLUSTER_MATCH_THRESHOLD;
  const clusters = buildClusterModels(params.samples, { matchThreshold });
  const userDuration = userDurationFromClusters(clusters);
  const personalMed = personalMedianMins(clusters);
  const closed = params.closedOutcomes ?? [];
  const closedSampleCount = closed.length;
  const learningPhase = learningPhaseFromClosedCount(closedSampleCount);
  const clustersWithDuration = clusters.filter((c) => c.durationSamples.length > 0)
    .length;
  const consistencies = clusters
    .map((c) => c.consistency)
    .filter((x): x is number => x != null);
  const meanConsistency =
    consistencies.length > 0
      ? consistencies.reduce((a, b) => a + b, 0) / consistencies.length
      : null;

  const maturity = maturityFromEvidence({
    closedSampleCount,
    clusterCount: clusters.length,
    clustersWithDuration,
    meanConsistency,
  });

  const calibration = calibrationFromClosed(closed);
  const beliefs = durationBeliefsFromClusters(clusters, params.updatedAt);

  if (userDuration) {
    beliefs.push({
      beliefId: `belief_duration_user_${params.userId}`,
      dimension: 'duration',
      subject: {
        clusterLabel: null,
        clusterId: null,
        jobId: null,
        locationKey: null,
        userWide: true,
      },
      value: userDuration,
      confidence: confidenceFromSamples(userDuration.sampleSize, meanConsistency),
      authority: authorityFromSamples(userDuration.sampleSize),
      evidenceIds: [],
      origin: 'observed',
      modelVersion: MODEL_VERSION,
      updatedAt: params.updatedAt,
    });
  }

  const state: ModelState = {
    userId: params.userId,
    modelVersion: MODEL_VERSION,
    maturity,
    learningPhase,
    closedSampleCount,
    priors: {
      softFloorMins: priors.softFloorMins,
      anchorSameDayRate: priors.anchorSameDayRate,
      flexibleSameDayRate: priors.flexibleSameDayRate,
      blendScale: priors.blendScale,
    },
    calibration: {
      durationBias: calibration.durationBias,
      durationMae: calibration.durationMae,
      intervalCoverage: null,
      explain: calibration.explain,
    },
    beliefIds: beliefs.map((b) => b.beliefId),
    updatedAt: params.updatedAt,
  };

  return {
    userId: params.userId,
    clusters,
    userDuration,
    personalMedianMins: personalMed,
    beliefs,
    state,
    matchThreshold,
  };
}

export function lookupHierarchicalDuration(
  text: string,
  model: PersonalModel,
  opts?: { priorStrength?: number }
): HierarchicalDuration {
  const priorStrength = opts?.priorStrength ?? DEFAULT_PRIOR_STRENGTH;
  const softFloor = model.state.priors.softFloorMins;
  const reasons: string[] = [];

  const match = matchCluster(text, model.clusters, model.matchThreshold);

  if (match && match.cluster.duration && match.cluster.durationSamples.length > 0) {
    const c = match.cluster;
    const n = c.durationSamples.length;
    let expected = c.duration.expectedMins;
    const level: HierarchicalDuration['level'] = 'cluster';
    let method: DurationDistribution['method'] = c.duration.method;

    if (n < 4) {
      const wider = model.personalMedianMins ?? softFloor;
      expected = Math.round(
        shrinkTowardPrior(expected, wider, n, priorStrength)
      );
      method = 'blended';
      reasons.push(
        `cluster n=${n}; shrunk toward ${model.personalMedianMins != null ? 'user median' : 'prior'}`
      );
    } else {
      reasons.push(`cluster "${c.label}" n=${n} match=${match.score.toFixed(2)}`);
    }

    const distribution: DurationDistribution = {
      expectedMins: expected,
      interval: c.duration.interval,
      sampleSize: n,
      method,
    };

    return {
      distribution,
      level,
      clusterId: c.clusterId,
      clusterLabel: c.label,
      matchScore: match.score,
      authority: authorityFromSamples(n),
      confidence: confidenceFromSamples(n, c.consistency),
      reasons,
    };
  }

  if (model.userDuration && model.personalMedianMins != null) {
    reasons.push(`no cluster match; user median n=${model.userDuration.sampleSize}`);
    let expected = model.userDuration.expectedMins;
    if (model.userDuration.sampleSize < 4) {
      expected = Math.round(
        shrinkTowardPrior(
          expected,
          softFloor,
          model.userDuration.sampleSize,
          priorStrength
        )
      );
      reasons.push('user sample sparse; shrunk toward onboarding floor');
    }
    return {
      distribution: {
        ...model.userDuration,
        expectedMins: expected,
        method:
          model.userDuration.sampleSize < 4 ? 'blended' : model.userDuration.method,
      },
      level: 'user',
      clusterId: null,
      clusterLabel: null,
      matchScore: null,
      authority: authorityFromSamples(model.userDuration.sampleSize),
      confidence: confidenceFromSamples(model.userDuration.sampleSize, null),
      reasons,
    };
  }

  if (softFloor > 0) {
    reasons.push('onboarding soft floor');
    const distribution =
      durationFromSamples([softFloor], 'prior') ?? {
        expectedMins: softFloor,
        interval: {
          low: Math.max(1, Math.round(softFloor * 0.75)),
          high: Math.round(softFloor * 1.25),
        },
        sampleSize: 0,
        method: 'prior' as const,
      };
    return {
      distribution: { ...distribution, method: 'prior', sampleSize: 0 },
      level: 'onboarding',
      clusterId: null,
      clusterLabel: null,
      matchScore: null,
      authority: 'observe',
      confidence: confidenceFromSamples(0, null),
      reasons,
    };
  }

  reasons.push('system default');
  return {
    distribution: {
      expectedMins: SYSTEM_DEFAULT_MINS,
      interval: { low: 15, high: 45 },
      sampleSize: 0,
      method: 'prior',
    },
    level: 'system',
    clusterId: null,
    clusterLabel: null,
    matchScore: null,
    authority: 'observe',
    confidence: confidenceFromSamples(0, null),
    reasons,
  };
}

export function lookupSameDayRate(
  text: string,
  model: PersonalModel
): SameDayLookup {
  const match = matchCluster(text, model.clusters, model.matchThreshold);
  if (
    match &&
    match.cluster.sameDayRate != null &&
    match.cluster.sameDaySamples >= 2
  ) {
    return {
      rate: match.cluster.sameDayRate,
      samples: match.cluster.sameDaySamples,
      clusterId: match.cluster.clusterId,
      clusterLabel: match.cluster.label,
      level: 'cluster',
    };
  }
  return {
    rate: null,
    samples: 0,
    clusterId: null,
    clusterLabel: null,
    level: 'unknown',
  };
}

export function historySampleFromRow(row: {
  text: string;
  actual_mins?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  job_id?: string | null;
  location_text?: string | null;
}): HistorySample {
  return {
    text: row.text,
    actualMins:
      typeof row.actual_mins === 'number' && row.actual_mins > 0
        ? row.actual_mins
        : null,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
    jobId: row.job_id ?? null,
    locationText: row.location_text ?? null,
  };
}

export function modelVersions() {
  return {
    modelVersion: MODEL_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    featureVersion: FEATURE_VERSION,
  };
}
