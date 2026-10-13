import { useMemo } from 'react';
import {
  suggestEstimate,
  effectiveEstimate,
  suggestLocation,
  suggestsLocation,
  suggestJob,
  suggestLocationMemory,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { buildRuntimeObservations } from '@/lib/dayFit';
import { calibrateFromOutcomes } from '@/lib/thinking/calibration';
import { getBuffer } from '@/lib/thinking/evidence';
import { lookupTaskSignals } from '@/lib/dayFit';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import { decidePersonalGravity } from '@/lib/thinking/decisions/personalGravity';
import type { UserProfile } from '@/lib/userProfile';
import type { Task } from '@/lib/taskTypes';

export function estimateContextFrom(
  source: {
    job_id?: string | null;
    location_text?: string | null;
    jobId?: string | null;
    locationText?: string | null;
  },
  now: Date
) {
  return {
    jobId: source.job_id ?? source.jobId ?? null,
    locationText: source.location_text ?? source.locationText ?? null,
    localHour: now.getHours(),
  };
}

type TodayIntelligenceInput = {
  tasks: Task[];
  history: HistoricalTask[];
  userProfile: UserProfile;
  now: Date;
  taskText: string;
  captureJobId: string | null;
  gravityDecision: ReturnType<typeof decidePersonalGravity>;
  captureLocation: string;
  manualLocationToggle: boolean;
};

/**
 * Shared deterministic intelligence projection for Today and capture.
 * Keeps the existing evidence, calibration and memoization boundaries intact.
 */
export function useTodayIntelligence({
  tasks,
  history,
  userProfile,
  now,
  taskText,
  captureJobId,
  gravityDecision,
  captureLocation,
  manualLocationToggle,
}: TodayIntelligenceInput) {
  const runtime = useMemo(() => {
    // Onboarding seeds the soft floor; calibration only overrides once it
    // has enough closed prediction loops (see MIN_SAMPLES in calibration).
    // Must never throw during render — blank Today is worse than a soft prior.
    try {
      const cal = calibrateFromOutcomes(getBuffer(), userProfile.softFloorBaseMins);
      return buildRuntimeObservations(history, {
        softFloorMins: cal.softFloorMins,
        blendScale: cal.blendScale,
        calibrationExplain: cal.explain,
        anchorSameDayRate: userProfile.anchorSameDayRate,
        flexibleSameDayRate: userProfile.flexibleSameDayRate,
      });
    } catch (err) {
      console.error('[TodayPage] runtime observations failed', err);
      return buildRuntimeObservations([], {
        softFloorMins: userProfile.softFloorBaseMins,
        blendScale: 1,
        calibrationExplain: null,
        anchorSameDayRate: userProfile.anchorSameDayRate,
        flexibleSameDayRate: userProfile.flexibleSameDayRate,
      });
    }
  }, [history, userProfile.softFloorBaseMins, userProfile.anchorSameDayRate, userProfile.flexibleSameDayRate]);

  const clusters = runtime.clusters;

  // Keep the cluster scan off the five-second clock-only render.
  const learnedEffectiveEstimates = useMemo(() => {
    const estimates = new Map<string, number>();
    for (const task of tasks) {
      if (task.estimate_mins <= 0) {
        estimates.set(task.id, task.estimate_mins);
        continue;
      }
      const suggestion = suggestEstimate(
        task.text,
        history,
        clusters,
        estimateContextFrom(task, now)
      );
      estimates.set(
        task.id,
        effectiveEstimate(task.estimate_mins, suggestion, runtime.blendScale)
      );
    }
    return estimates;
  }, [tasks, history, clusters, runtime.blendScale, now.getHours()]);

  const captureSignals = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return lookupTaskSignals(trimmed, runtime);
  }, [taskText, runtime]);

  const captureSuggestion = captureSignals?.estimate ?? null;
  const captureDurationExplain = captureSignals?.explainDuration ?? null;

  const captureLocationSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocation(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureJobSuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestJob(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureLocationMemorySuggestion = useMemo(() => {
    const trimmed = taskText.trim();
    if (trimmed.length === 0) return null;
    return suggestLocationMemory(trimmed, history, clusters);
  }, [taskText, history, clusters]);

  const captureContext = useMemo(() => {
    const trimmed = taskText.trim();
    return decideCaptureContext({
      surface: 'today',
      currentJobId: captureJobId,
      taskText: trimmed,
      jobDecision: captureJobSuggestion,
      locationDecision: captureLocationMemorySuggestion,
      gravityDecision,
    });
  }, [taskText, captureJobId, captureJobSuggestion, captureLocationMemorySuggestion, gravityDecision]);

  // Deterministic phrase heuristic; it never silently creates a location.
  const locationFieldVisible =
    suggestsLocation(taskText) || captureLocation.length > 0 || manualLocationToggle;

  return {
    runtime,
    clusters,
    learnedEffectiveEstimates,
    captureSuggestion,
    captureDurationExplain,
    captureLocationSuggestion,
    captureJobSuggestion,
    captureLocationMemorySuggestion,
    captureContext,
    locationFieldVisible,
  };
}
