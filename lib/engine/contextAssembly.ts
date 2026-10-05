/**
 * Explicit ReasoningContext snapshot — no arbitrary UI state.
 */

import type { ReasoningContext, WorkingMemorySnapshot } from './types';
import { emptyWorkingMemory } from './workingMemory';

export type ContextInputs = {
  nowIso?: string;
  surfaceDate?: string | null;
  remainingMinsToday?: number | null;
  openTaskCount?: number;
  jobs?: ReasoningContext['jobs'];
  meetings?: ReasoningContext['meetings'];
  knownLocations?: string[];
  communicationHints?: string[];
  workingMemory?: WorkingMemorySnapshot;
};

export function assembleContext(inputs: ContextInputs = {}): ReasoningContext {
  return {
    nowIso: inputs.nowIso ?? new Date().toISOString(),
    surfaceDate: inputs.surfaceDate ?? null,
    remainingMinsToday:
      inputs.remainingMinsToday === undefined ? null : inputs.remainingMinsToday,
    openTaskCount: inputs.openTaskCount ?? 0,
    jobs: inputs.jobs ?? [],
    meetings: inputs.meetings ?? [],
    knownLocations: inputs.knownLocations ?? [],
    communicationHints: inputs.communicationHints ?? [],
    workingMemory: inputs.workingMemory ?? emptyWorkingMemory(),
  };
}

/** Fuzzy match job by spoken name (deterministic containment). */
export function resolveJobName(
  spoken: string | null | undefined,
  jobs: ReasoningContext['jobs']
): { id: string; name: string } | null {
  if (!spoken || !jobs.length) return null;
  const key = spoken.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (!key) return null;
  const hits = jobs.filter((j) => {
    const n = j.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return n === key || n.includes(key) || key.includes(n);
  });
  if (hits.length === 1) return { id: hits[0].id, name: hits[0].name };
  return null;
}

export function resolveLocationAgainstJobs(
  locationText: string | null | undefined,
  jobs: ReasoningContext['jobs']
): { id: string; name: string; matchedField: 'name' | 'location' } | null {
  if (!locationText || !jobs.length) return null;
  const key = locationText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const byName = resolveJobName(locationText, jobs);
  if (byName) return { ...byName, matchedField: 'name' };
  const byLoc = jobs.filter((j) => {
    const loc = (j.locationText || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return loc && (loc.includes(key) || key.includes(loc));
  });
  if (byLoc.length === 1) {
    return { id: byLoc[0].id, name: byLoc[0].name, matchedField: 'location' };
  }
  return null;
}
