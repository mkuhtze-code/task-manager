/**
 * FP-1 — Learning rates for clean duration evidence.
 *
 * shrinkTowardPrior(priorStrength): higher = more stick to prior (slower personal learning).
 * Fast personalisation lowers prior strength for early clean samples so the leaf moves hard.
 *
 * Dirty episodes never reach this schedule (gated in FP-0 outcome channels).
 */

/** Must stay aligned with model.DEFAULT_PRIOR_STRENGTH. */
const DEFAULT_PRIOR_STRENGTH = 3;

/** Clean duration samples on the matched leaf (cluster or context). */
export function priorStrengthForCleanN(cleanN: number): number {
  if (cleanN <= 0) return DEFAULT_PRIOR_STRENGTH * 2; // 6 — stay on prior
  if (cleanN === 1) return 4; // moderate first pull
  if (cleanN <= 5) return 1.15; // aggressive leaf (brief: episodes 2–5)
  if (cleanN <= 10) return 2;
  return DEFAULT_PRIOR_STRENGTH; // 3 — established
}

/**
 * Authority band for UI/runtime (aligned with brief §10).
 * Uses effective clean-n, not raw history length.
 */
export type BeliefAuthority =
  | 'unknown'
  | 'early'
  | 'forming'
  | 'established'
  | 'contested';

export function authorityFromCleanN(
  cleanN: number,
  opts?: { contested?: boolean }
): BeliefAuthority {
  if (opts?.contested) return 'contested';
  if (cleanN <= 0) return 'unknown';
  if (cleanN <= 2) return 'early';
  if (cleanN <= 6) return 'forming';
  return 'established';
}

/** Context leaf may speak at n≥3 (already MIN_CONTEXT_SAMPLES). */
export const CONTEXT_LEAF_AUTHORITY_MIN = 3;
