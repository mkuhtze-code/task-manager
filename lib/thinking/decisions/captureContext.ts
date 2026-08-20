// lib/thinking/decisions/captureContext.ts
//
// Capture Context decision (Scope 3H).
//
// Composes all capture-time signals into a single, unified decision.
// This function does not re-run individual decisions — it receives
// their outputs and applies a deterministic priority hierarchy.
//
// The purpose is to make the capture layer context-aware without
// duplicating decision logic. Each individual decision (job context,
// location memory, personal gravity) remains independent and
// testable. This function assembles them.
//
// Priority hierarchy (explicit user input always wins):
//
//   1. Current explicit job (user is inside a Job) — highest
//   2. Strong text-match job inference — high
//   3. Suggest-level text-match job inference — medium
//   4. Strong location memory — high (for location only)
//   5. Suggest-level location memory — medium (for location only)
//   6. Personal gravity (supporting signal) — may elevate weak inference
//   7. No context — observe (do nothing)
//
// All decisions are deterministic. Same input → identical output.

import type {
  CaptureContextDecision,
  DecisionAuthority,
  PersonalGravityDecision,
  Surface,
} from '../types';
import type { JobSuggestion, LocationMemorySuggestion } from '../../taskIntelligence';

// ── Input contract ───────────────────────────────────────────────
// Everything the composition function needs. The caller (page-level
// integration) is responsible for loading this data and computing
// the individual decisions. The function is pure over these inputs.
//
// Uses JobSuggestion and LocationMemorySuggestion from taskIntelligence
// rather than the raw thinking engine types, since those are what
// the existing suggest functions return.

export type CaptureContextInput = {
  surface: Surface;
  currentJobId: string | null;
  taskText: string;
  jobDecision: JobSuggestion | null;
  locationDecision: LocationMemorySuggestion | null;
  gravityDecision: PersonalGravityDecision;
};

// ── Authority helpers ────────────────────────────────────────────
// Compare authority levels for precedence. 'strong' > 'suggest' > 'observe'.

function authorityRank(a: DecisionAuthority): number {
  if (a === 'strong') return 2;
  if (a === 'suggest') return 1;
  return 0;
}

function higherAuthority(a: DecisionAuthority, b: DecisionAuthority): DecisionAuthority {
  return authorityRank(a) >= authorityRank(b) ? a : b;
}

// ── Main composition ─────────────────────────────────────────────
// Takes all available capture-time signals and produces a single
// CaptureContextDecision. The UI consumes this object directly.
//
// Rules:
//
// 1. If the user is inside a Job (currentJobId is set), that is
//    the captured job context. No inference is needed. The job
//    decision from text matching is ignored — explicit context
//    outranks inference.
//
// 2. If the user is on Today (no currentJobId), the job decision
//    from text matching provides the suggested job. Authority
//    follows the job decision's authority level.
//
// 3. Location memory is always available regardless of surface.
//    Strong authority auto-fills; suggest shows a chip; observe
//    does nothing.
//
// 4. Personal gravity is a supporting signal. It does not force
//    a job or location. Its authority may elevate a weak inference
//    when the user has demonstrated strong surface preference.
//    Specifically: if gravity is strong for Jobs and the job
//    decision is observe, gravity may bump it to suggest.
//
// 5. The source field records where the primary context came from.
//
// 6. When there is no context at all, the result is observe with
//    null suggestions — the UI does nothing.

export function decideCaptureContext(input: CaptureContextInput): CaptureContextDecision {
  const { surface, currentJobId, jobDecision, locationDecision, gravityDecision } = input;

  // ── Job context ──────────────────────────────────────────────
  let suggestedJobId: string | null = null;
  let jobAuthority: DecisionAuthority = 'observe';
  let source: CaptureContextDecision['source'] = null;

  if (currentJobId) {
    // Rule 1: Inside a Job — explicit context wins.
    suggestedJobId = currentJobId;
    jobAuthority = 'strong';
    source = 'explicit_job';
  } else if (jobDecision) {
    // Rule 2: On Today — text-match inference.
    suggestedJobId = jobDecision.jobId;
    jobAuthority = jobDecision.authority;
    source = 'text_match';

    // Rule 4: Gravity may elevate weak inference.
    // If gravity strongly prefers Jobs and the job decision is only
    // observe, promote it to suggest. This makes the engine slightly
    // more proactive when the user has demonstrated Jobs behaviour,
    // but never overrides explicit user input.
    if (
      jobAuthority === 'observe' &&
      gravityDecision.preferredSurface === 'jobs' &&
      gravityDecision.authority === 'strong'
    ) {
      jobAuthority = 'suggest';
    }
  }

  // ── Location context ─────────────────────────────────────────
  // Location memory operates independently of job context.
  // Strong authority auto-fills; suggest shows a chip.
  let suggestedLocation: CaptureContextDecision['suggestedLocation'] = null;
  let locationAuthority: DecisionAuthority = 'observe';

  if (locationDecision) {
    suggestedLocation = {
      text: locationDecision.locationText,
      lat: locationDecision.lat,
      lng: locationDecision.lng,
    };
    locationAuthority = locationDecision.authority;
  }

  // ── Composed authority ───────────────────────────────────────
  // The overall authority is the stronger of job and location.
  // This determines what the UI auto-fills vs suggests.
  const authority = higherAuthority(jobAuthority, locationAuthority);

  return {
    kind: 'capture_context',
    suggestedJobId,
    suggestedLocation,
    authority,
    source,
  };
}
