/**
 * FP-0 — Outcome channels.
 *
 * Maps Reality Check + timer/episode facts → training channels.
 * Duration learning is allowed only for clean_done.
 *
 * Pure. Deterministic. No I/O.
 */

import type { WorkEpisode, EpisodeOutcome, DurationEvidenceKind } from './episodes';

/** First-party training channels (Fast Personalisation brief §7). */
export type TrainingChannel =
  | 'clean_done'
  | 'partial'
  | 'carry'
  | 'interrupted'
  | 'blocked'
  | 'scope_changed'
  | 'abandoned'
  | 'no_capacity'
  | 'skip'
  | 'unknown';

/** Reality Check UI outcomes (lib/realityCapture). */
export type RealityOutcomeLike = 'done' | 'partial' | 'carried' | 'skipped';

/** Subset persisted on prediction_log.outcome_kind */
export type LogOutcomeKind =
  | 'done'
  | 'partial'
  | 'carry'
  | 'skip'
  | 'resume'
  | 'edited'
  | null;

export type OutcomeChannelInput = {
  /** Reality Check / explicit user outcome when known. */
  realityOutcome?: RealityOutcomeLike | null;
  /** Legacy prediction_log / closeCompletionLoop kind. */
  outcomeKind?: LogOutcomeKind | EpisodeOutcome | string | null;
  /** Episode duration evidence when built. */
  durationEvidence?: DurationEvidenceKind | null;
  interruptionMinutes?: number | null;
  waitingMinutes?: number | null;
  /** Measured/active minutes offered for training. */
  measuredMins?: number | null;
  /** True when taskId was present for identity linkage. */
  hasTaskId?: boolean;
};

export type OutcomeChannelResult = {
  channel: TrainingChannel;
  /** Only true for clean_done with usable minutes path allowed by caller gates. */
  mayTrainDuration: boolean;
  /** Value to persist on prediction_log. */
  logOutcomeKind: LogOutcomeKind;
  reasons: string[];
};

function normalizeReality(
  reality: RealityOutcomeLike | null | undefined,
  outcomeKind: string | null | undefined
): RealityOutcomeLike | null {
  if (reality === 'done' || reality === 'partial' || reality === 'carried' || reality === 'skipped') {
    return reality;
  }
  if (outcomeKind === 'done') return 'done';
  if (outcomeKind === 'partial') return 'partial';
  if (outcomeKind === 'carry' || outcomeKind === 'carried') return 'carried';
  if (outcomeKind === 'skip' || outcomeKind === 'skipped') return 'skipped';
  if (outcomeKind === 'interrupted') return 'done';
  return null;
}

/**
 * Classify how this completion may train the personal model.
 *
 * Duration training is reserved for clean_done only (FP-0 / brief §7.1–7.2).
 */
export function classifyOutcomeChannel(
  input: OutcomeChannelInput
): OutcomeChannelResult {
  const reasons: string[] = [];
  const reality = normalizeReality(input.realityOutcome, input.outcomeKind ?? null);
  const evidence = input.durationEvidence ?? null;
  const interruption =
    typeof input.interruptionMinutes === 'number' && input.interruptionMinutes > 0
      ? input.interruptionMinutes
      : 0;
  const waiting =
    typeof input.waitingMinutes === 'number' && input.waitingMinutes > 0
      ? input.waitingMinutes
      : 0;

  if (input.hasTaskId === false) {
    reasons.push('missing taskId — prediction linkage weak');
  }

  if (reality === 'carried') {
    reasons.push('reality=carry → carry channel; no duration train');
    return {
      channel: 'carry',
      mayTrainDuration: false,
      logOutcomeKind: 'carry',
      reasons,
    };
  }

  if (reality === 'skipped') {
    reasons.push('reality=skip → skip channel; no duration train');
    return {
      channel: 'skip',
      mayTrainDuration: false,
      logOutcomeKind: 'skip',
      reasons,
    };
  }

  if (reality === 'partial') {
    reasons.push('reality=partial → partial channel; no full-duration train');
    return {
      channel: 'partial',
      mayTrainDuration: false,
      logOutcomeKind: 'partial',
      reasons,
    };
  }

  if (evidence === 'contaminated' || interruption > 0) {
    reasons.push(
      evidence === 'contaminated'
        ? 'durationEvidence=contaminated'
        : `interruptionMinutes=${interruption}`
    );
    return {
      channel: 'interrupted',
      mayTrainDuration: false,
      logOutcomeKind: 'done',
      reasons,
    };
  }

  if (waiting > 0 && (input.measuredMins == null || input.measuredMins <= 0)) {
    reasons.push('waiting without active work → blocked/no_capacity style');
    return {
      channel: 'blocked',
      mayTrainDuration: false,
      logOutcomeKind: 'done',
      reasons,
    };
  }

  if (input.outcomeKind === 'interrupted') {
    reasons.push('outcomeKind=interrupted');
    return {
      channel: 'interrupted',
      mayTrainDuration: false,
      logOutcomeKind: 'done',
      reasons,
    };
  }

  if (reality === 'done' || reality == null) {
    if (evidence === 'none') {
      reasons.push('no duration evidence');
      return {
        channel: 'unknown',
        mayTrainDuration: false,
        logOutcomeKind: 'done',
        reasons,
      };
    }

    reasons.push('clean_done candidate');
    return {
      channel: 'clean_done',
      mayTrainDuration: true,
      logOutcomeKind: 'done',
      reasons,
    };
  }

  reasons.push('unclassified → unknown');
  return {
    channel: 'unknown',
    mayTrainDuration: false,
    logOutcomeKind: null,
    reasons,
  };
}

/**
 * Map a built WorkEpisode + optional reality outcome to a channel.
 */
export function channelFromEpisode(
  episode: WorkEpisode,
  realityOutcome?: RealityOutcomeLike | null
): OutcomeChannelResult {
  return classifyOutcomeChannel({
    realityOutcome,
    outcomeKind: episode.outcome,
    durationEvidence: episode.durationEvidence,
    interruptionMinutes: episode.interruptionMinutes,
    waitingMinutes: episode.waitingMinutes,
    measuredMins: episode.trainActiveMinutes,
    hasTaskId: Boolean(episode.taskId?.trim()),
  });
}

export function mayTrainDurationFromChannel(channel: TrainingChannel): boolean {
  return channel === 'clean_done';
}
