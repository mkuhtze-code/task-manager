// lib/thinking/decisions/personalGravity.ts
//
// Personal Gravity decision layer (Scope 3G).
//
// Determines whether the user has demonstrated a meaningful, persistent
// preference for a particular Dokkit surface (Today, Jobs, Travel).
// The result drives quiet surface adaptation — the starting surface
// may shift if evidence is strong enough.
//
// Evidence model:
//   Active events (user deliberately navigated via TopSwitcher) carry
//   substantially more weight than passive events (landing on a page
//   by default). A user who simply lands on Today repeatedly has not
//   demonstrated preference — they have been exposed to the default.
//
// Thresholds:
//   MIN_TOTAL_EVENTS      Minimum events before any decision is made.
//   MIN_DAYS_OBSERVED     Minimum calendar span (days) of observation.
//   ACTIVE_WEIGHT          Weight multiplier for active navigation.
//   STRONG_MARGIN          Score margin required for 'strong' authority.
//   SUGGEST_MARGIN         Score margin required for 'suggest' authority.
//   LOOKBACK_DAYS          How far back to consider events.
//
// All decisions are deterministic. Same input → identical output.

import type { Surface, SurfaceEvent, PersonalGravityDecision, DecisionAuthority } from '../types';

// ── Constants ───────────────────────────────────────────────────
// These thresholds are intentionally conservative. Personal Gravity
// must not make the interface jump around based on weak evidence.
//
// MIN_TOTAL_EVENTS (8): Enough to establish a pattern beyond
//   coincidence, but not so many that new users never see adaptation.
//
// MIN_DAYS_OBSERVED (3): Behaviour must span at least 3 separate
//   calendar days. A single session with many clicks is not
//   demonstrated preference — it is one session.
//
// ACTIVE_WEIGHT (3×): Active navigation carries three times the
//   weight of passive exposure. The user deliberately chose to
//   go somewhere. Landing on Today by default is not a choice.
//
// STRONG_MARGIN (0.30): The top surface must outscore the runner-up
//   by at least 30% of the total weighted score. This prevents
//   adaptation when surfaces are similarly popular.
//
// SUGGEST_MARGIN (0.15): A lower bar for the 'suggest' authority.
//   Emerging preference, not yet strong enough for visible adaptation
//   but useful for internal prioritisation.
//
// LOOKBACK_DAYS (60): Two months of history. Older patterns may no
//   longer reflect how the user currently works.

export const MIN_TOTAL_EVENTS = 8;
export const MIN_DAYS_OBSERVED = 3;
export const ACTIVE_WEIGHT = 3;
export const PASSIVE_WEIGHT = 1;
export const STRONG_MARGIN = 0.30;
export const SUGGEST_MARGIN = 0.15;
export const LOOKBACK_DAYS = 60;

const SURFACES: Surface[] = ['today', 'jobs', 'travel'];

// ── Helpers ─────────────────────────────────────────────────────

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function countDistinctDays(events: SurfaceEvent[]): number {
  const days = new Set(events.map((e) => toDateKey(e.created_at)));
  return days.size;
}

// ── Main decision ───────────────────────────────────────────────
// Takes raw surface events (from Supabase) and returns a structured
// decision. The caller is responsible for querying events — this
// function is pure over data.
//
// The scoring model:
//   score(surface) = Σ (active ? ACTIVE_WEIGHT : PASSIVE_WEIGHT)
//
// Then normalised to [0, 1] by dividing by the maximum possible
// score (total events × ACTIVE_WEIGHT).
//
// Margin = normalised_score(top) - normalised_score(second).
//
// If margin >= STRONG_MARGIN → authority = 'strong'
// If margin >= SUGGEST_MARGIN → authority = 'suggest'
// Otherwise → authority = 'observe' (no adaptation)

export function decidePersonalGravity(
  events: SurfaceEvent[],
  _now?: Date
): PersonalGravityDecision {
  const now = _now ?? new Date();

  // Filter to lookback window
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffMs = cutoff.getTime();

  const recent = events.filter((e) => new Date(e.created_at).getTime() >= cutoffMs);

  // Initialise per-surface counts
  const bySurface: Record<Surface, { active: number; passive: number }> = {
    today: { active: 0, passive: 0 },
    jobs: { active: 0, passive: 0 },
    travel: { active: 0, passive: 0 },
  };

  for (const e of recent) {
    if (e.active) {
      bySurface[e.surface].active++;
    } else {
      bySurface[e.surface].passive++;
    }
  }

  const totalEvents = recent.length;
  const daysObserved = countDistinctDays(recent);

  // Insufficient evidence — do nothing
  if (totalEvents < MIN_TOTAL_EVENTS || daysObserved < MIN_DAYS_OBSERVED) {
    return {
      kind: 'personal_gravity',
      preferredSurface: null,
      authority: 'observe',
      evidence: { bySurface, totalEvents, daysObserved },
      margin: 0,
    };
  }

  // Compute weighted scores per surface
  const scores: Record<Surface, number> = {
    today: bySurface.today.active * ACTIVE_WEIGHT + bySurface.today.passive * PASSIVE_WEIGHT,
    jobs: bySurface.jobs.active * ACTIVE_WEIGHT + bySurface.jobs.passive * PASSIVE_WEIGHT,
    travel: bySurface.travel.active * ACTIVE_WEIGHT + bySurface.travel.passive * PASSIVE_WEIGHT,
  };

  // Sort surfaces by score descending
  const ranked = SURFACES
    .map((s) => ({ surface: s, score: scores[s] }))
    .sort((a, b) => b.score - a.score);

  const topScore = ranked[0].score;
  const secondScore = ranked[1].score;

  // Maximum possible total weighted score (for normalisation)
  const maxPossible = totalEvents * ACTIVE_WEIGHT;
  if (maxPossible === 0) {
    return {
      kind: 'personal_gravity',
      preferredSurface: null,
      authority: 'observe',
      evidence: { bySurface, totalEvents, daysObserved },
      margin: 0,
    };
  }

  const normalisedTop = topScore / maxPossible;
  const normalisedSecond = secondScore / maxPossible;
  const margin = normalisedTop - normalisedSecond;

  // Determine authority
  let authority: DecisionAuthority = 'observe';
  let preferredSurface: Surface | null = null;

  if (margin >= STRONG_MARGIN) {
    authority = 'strong';
    preferredSurface = ranked[0].surface;
  } else if (margin >= SUGGEST_MARGIN) {
    authority = 'suggest';
    preferredSurface = ranked[0].surface;
  }

  return {
    kind: 'personal_gravity',
    preferredSurface,
    authority,
    evidence: { bySurface, totalEvents, daysObserved },
    margin,
  };
}
