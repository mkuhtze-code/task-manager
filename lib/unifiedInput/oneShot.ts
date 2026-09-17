/**
 * One-shot dock — high-confidence thoughts land without a form quiz.
 *
 * Deterministic. Never docks while a place/job still needs a yes/no or
 * which-one answer. Empty estimate is allowed (0). Tool conforms to the user.
 */

import type { ThoughtParts } from '@/lib/unifiedInput/parse';
import type { JobLocationResolution } from '@/lib/unifiedInput/resolve';
import { fmtClock, fmtSurfaceDate } from '@/lib/timeFormat';

export type OneShotGate = {
  /** Safe to write the task without further capture UI. */
  ready: boolean;
  /** Why the gate is closed (calm, short). */
  blockReason: string | null;
};

/**
 * Gate for one-shot dock.
 * - Needs non-empty text
 * - Blocks while resolution is proposed/choose and the user has not
 *   confirmed or declined
 * - known / none / declined / confirmed → open
 */
export function oneShotGate(params: {
  rawText: string;
  thought: ThoughtParts | null;
  locationResolution: JobLocationResolution | null;
  declinedResolution: boolean;
  confirmedJobId: string | null;
}): OneShotGate {
  const raw = params.rawText.trim();
  if (raw.length === 0) {
    return { ready: false, blockReason: null };
  }

  const res = params.locationResolution;
  if (res && !params.declinedResolution && params.confirmedJobId == null) {
    if (res.state === 'proposed') {
      return {
        ready: false,
        blockReason: 'Confirm or skip the place first',
      };
    }
    if (res.state === 'choose') {
      return {
        ready: false,
        blockReason: 'Pick which place, or skip',
      };
    }
  }

  return { ready: true, blockReason: null };
}

/** Compact line after a successful one-shot dock. */
export function formatDockSummary(params: {
  text: string;
  surfaceDate: string | null;
  intendedTime: string | null;
  locationText: string | null;
  jobName: string | null;
}): string {
  const parts: string[] = [params.text.trim()];
  if (params.surfaceDate) {
    try {
      parts.push(fmtSurfaceDate(params.surfaceDate));
    } catch {
      parts.push(params.surfaceDate);
    }
  }
  if (params.intendedTime) {
    try {
      parts.push(fmtClock(params.intendedTime));
    } catch {
      parts.push(params.intendedTime);
    }
  }
  if (params.jobName) parts.push(params.jobName);
  else if (params.locationText) parts.push(params.locationText);
  return parts.join(' · ');
}
