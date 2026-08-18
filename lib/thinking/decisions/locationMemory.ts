// lib/thinking/decisions/locationMemory.ts
//
// Decision 2: Location Memory
//
// Replaces weak "last seen location" behaviour with a deterministic
// contextual location decision using the stronger spatial evidence
// from Scope 3B place associations.
//
// The decision answers:
//   "Does this activity have enough repeated spatial evidence that
//    Dokkit can quietly suggest a known location?"
//
// Requirements:
//   - insufficient evidence → null
//   - ambiguous places → null
//   - conflicting places → null
//   - user already supplied a location → null
//   - deterministic result
//   - no persistence
//   - no location type interpretation
//   - no "home", "supplier", "job site" semantic labels
//   - no guessing from text alone when coordinates are absent
//   - coordinate-based evidence remains primary
//
// Uses the existing 50m same-place convention from Scope 3A.
// No second spatial threshold is invented.

import type { CompletedTaskFacts, LocationMemoryDecision, DecisionAuthority } from '../types';
import type { ClusterPlaceAssociation } from '../associations/types';
import { classifyConfidence } from '../confidence';

// ── Evidence thresholds ──────────────────────────────────────────
// Higher than Scope 3B's minimum (3/0.5) because this decision
// may pre-fill a form field. A stronger evidence bar reduces
// false positives from sparse data.

export const MIN_OCCURRENCES_FOR_LOCATION = 4;
export const MIN_RATIO_FOR_LOCATION = 0.7;

// ── Authority from confidence ─────────────────────────────────────

function authorityFromConfidence(confidence: string): DecisionAuthority {
  if (confidence === 'high') return 'strong';
  if (confidence === 'medium') return 'suggest';
  return 'observe';
}

// ── Main decision function ───────────────────────────────────────
//
// Consumes the task to evaluate (to check for user override) and
// the pre-computed Scope 3B place associations for its cluster.
//
// Also needs the cluster tasks to resolve coordinates for the
// winning place association (ClusterPlaceAssociation doesn't store lat/lng).

export function decideLocationMemory(
  task: CompletedTaskFacts,
  clusterTasks: CompletedTaskFacts[],
  placeAssociations: ClusterPlaceAssociation[],
): LocationMemoryDecision | null {
  // ── User override: task already has location info ──────────
  if (
    task.location_text ||
    (task.lat != null && task.lng != null)
  ) {
    return null;
  }

  // ── Filter to associations meeting our evidence bar ────────
  const strong = placeAssociations.filter(
    (a) =>
      a.occurrenceCount >= MIN_OCCURRENCES_FOR_LOCATION &&
      a.ratio >= MIN_RATIO_FOR_LOCATION
  );

  if (strong.length === 0) return null;

  // ── Ambiguity: multiple dominant places → null ─────────────
  if (strong.length > 1) return null;

  const winner = strong[0];

  // ── Resolve coordinates from cluster tasks ─────────────────
  // Find the first task in the cluster whose location_text matches
  // the association's representative text and has valid coordinates.
  const representative = clusterTasks.find(
    (t) =>
      (t.location_text ?? '(unknown)') === winner.locationText &&
      t.lat != null &&
      t.lng != null &&
      Number.isFinite(t.lat) &&
      Number.isFinite(t.lng)
  );

  if (!representative) return null;

  const confidence = classifyConfidence(winner.occurrenceCount);
  const authority = authorityFromConfidence(confidence);

  // Only suggest at medium+ authority
  if (authority === 'observe') return null;

  return {
    kind: 'location_memory',
    locationText: winner.locationText,
    lat: representative.lat!,
    lng: representative.lng!,
    confidence,
    authority,
    occurrenceCount: winner.occurrenceCount,
    ratio: winner.ratio,
  };
}
