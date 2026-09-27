// lib/thinking/v3/episodes.ts
//
// Phase 5.5 — WorkEpisode: first-class representation of actual execution.
// Elapsed wall-clock is NOT equivalent to active work.

export type EpisodeOutcome =
  | 'done'
  | 'partial'
  | 'carry'
  | 'skip'
  | 'interrupted'
  | 'unknown';

export type DurationEvidenceKind =
  | 'active_measured'
  | 'elapsed_only'
  | 'reported'
  | 'contaminated'
  | 'none';

export type WorkEpisode = {
  episodeId: string;
  taskId: string;
  userId: string;
  startedAt: string | null;
  endedAt: string | null;
  activeMinutes: number | null;
  elapsedMinutes: number | null;
  interruptionMinutes: number | null;
  waitingMinutes: number | null;
  jobId: string | null;
  locationText: string | null;
  localHour: number | null;
  precedingTaskId: string | null;
  followingTaskId: string | null;
  outcome: EpisodeOutcome;
  durationEvidence: DurationEvidenceKind;
  trainActiveMinutes: number | null;
  confidence: 'low' | 'medium' | 'high';
};

export type EpisodeBuildInput = {
  episodeId: string;
  taskId: string;
  userId: string;
  startedAt?: string | null;
  endedAt?: string | null;
  activeMinutes?: number | null;
  interruptionMinutes?: number | null;
  waitingMinutes?: number | null;
  jobId?: string | null;
  locationText?: string | null;
  localHour?: number | null;
  precedingTaskId?: string | null;
  followingTaskId?: string | null;
  outcome?: EpisodeOutcome;
  legacyActualMins?: number | null;
};

export function buildWorkEpisode(input: EpisodeBuildInput): WorkEpisode {
  const startedAt = input.startedAt ?? null;
  const endedAt = input.endedAt ?? null;

  let elapsedMinutes: number | null = null;
  if (startedAt && endedAt) {
    const a = new Date(startedAt).getTime();
    const b = new Date(endedAt).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
      elapsedMinutes = Math.round((b - a) / 60000);
    }
  }

  const active =
    typeof input.activeMinutes === 'number' && input.activeMinutes > 0
      ? Math.round(input.activeMinutes)
      : null;
  const interruption =
    typeof input.interruptionMinutes === 'number' && input.interruptionMinutes >= 0
      ? Math.round(input.interruptionMinutes)
      : null;
  const waiting =
    typeof input.waitingMinutes === 'number' && input.waitingMinutes >= 0
      ? Math.round(input.waitingMinutes)
      : null;
  const legacy =
    typeof input.legacyActualMins === 'number' && input.legacyActualMins > 0
      ? Math.round(input.legacyActualMins)
      : null;

  let durationEvidence: DurationEvidenceKind;
  let trainActiveMinutes: number | null;
  let confidence: WorkEpisode['confidence'];

  if (active != null) {
    durationEvidence = 'active_measured';
    trainActiveMinutes = active;
    confidence = 'high';
  } else if (legacy != null && interruption != null && interruption >= (legacy * 0.5)) {
    durationEvidence = 'contaminated';
    trainActiveMinutes = null;
    confidence = 'low';
  } else if (legacy != null && startedAt && endedAt) {
    durationEvidence = 'elapsed_only';
    trainActiveMinutes = legacy;
    confidence = 'medium';
  } else if (legacy != null) {
    durationEvidence = 'reported';
    trainActiveMinutes = legacy;
    confidence = 'medium';
  } else if (elapsedMinutes != null && elapsedMinutes > 0) {
    durationEvidence = 'elapsed_only';
    trainActiveMinutes = elapsedMinutes;
    confidence = 'low';
  } else {
    durationEvidence = 'none';
    trainActiveMinutes = null;
    confidence = 'low';
  }

  return {
    episodeId: input.episodeId,
    taskId: input.taskId,
    userId: input.userId,
    startedAt,
    endedAt,
    activeMinutes: active,
    elapsedMinutes:
      elapsedMinutes ?? (legacy != null && !startedAt ? legacy : elapsedMinutes),
    interruptionMinutes: interruption,
    waitingMinutes: waiting,
    jobId: input.jobId ?? null,
    locationText: input.locationText ?? null,
    localHour: input.localHour ?? null,
    precedingTaskId: input.precedingTaskId ?? null,
    followingTaskId: input.followingTaskId ?? null,
    outcome: input.outcome ?? 'unknown',
    durationEvidence,
    trainActiveMinutes,
    confidence,
  };
}

export function trainMinutesFromEpisode(ep: WorkEpisode): number | null {
  if (ep.durationEvidence === 'contaminated' || ep.durationEvidence === 'none') {
    return null;
  }
  if (ep.trainActiveMinutes == null || ep.trainActiveMinutes <= 0) return null;
  return ep.trainActiveMinutes;
}

export function safeActualForCalibration(ep: WorkEpisode): number | null {
  return trainMinutesFromEpisode(ep);
}
