/**
 * Visit intent — personal + structural, not niche keyword lists.
 *
 * Principle: location on a task is often *context* (which client/job), not
 * proof the person must drive there today. Drive time is only added with
 * positive structural or personal evidence.
 *
 * Signals (strongest first):
 *  1. Explicit requires_visit / on_site
 *  2. No coords → cannot route
 *  3. Pin ≈ home/work → already there
 *  4. Universal desk/remote language → context (cross-domain)
 *  5. Personal visit rate from this user's past located work
 *  6. Work type / travel emphasis from profile (field vs desk prior)
 *  7. User attached place text + pin away from base
 *  8. Light language prior only as a weak nudge (not a gate)
 *
 * Pure. Deterministic. No network.
 */

export type Coords = { lat: number; lng: number };

export type VisitIntent = 'must_visit' | 'context_only';

export type VisitTaskLike = {
  text?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_text?: string | null;
  job_id?: string | null;
  requires_visit?: boolean | null;
  on_site?: boolean | null;
};

export type VisitProfilePrior = {
  /** Onboarding / settings work type (e.g. trades_field, office, creative). */
  workType?: string | null;
  /** Profile says travel is central to the day. */
  travelEmphasis?: boolean | null;
};

export type VisitPersonalEvidence = {
  /**
   * 0–1: among past located completions, share that looked like real visits.
   * Null when not enough samples.
   */
  visitRate?: number | null;
  samples?: number;
};

export type VisitClassifyOpts = {
  bases?: { home?: Coords | null; work?: Coords | null };
  profile?: VisitProfilePrior | null;
  personal?: VisitPersonalEvidence | null;
};

/** ~400 m — same pin as home/work is not a separate stop. */
const BASE_NEAR_DEG = 0.004;

/** ~1.5 km — "away from base" for soft structural visit prior. */
const AWAY_FROM_BASE_DEG = 0.015;

/**
 * Cross-domain desk/remote language. Intentionally small and universal —
 * not trade-specific. These almost never require driving to a pin.
 */
const DESK_REMOTE_RE =
  /\b(?:call|phone|email|e-?mail|message|sms|zoom|teams|meet\s+online|video\s+call|invoice|quote\s+(?:for|the)|order\s+online|draft|write\s+up|review\s+(?:docs?|plans?|drawings?)|schedule|book\s+(?:in|appointment)|admin|paperwork|follow-?up\s+email|send\s+(?:email|file|pdf)|reply|research\s+online)\b/i;

/**
 * Weak, language-agnostic presence nudges — optional boost only.
 * Not required; field workers with client addresses work without these.
 */
const PRESENCE_NUDGE_RE =
  /\b(?:on-?site|onsite|site\s+visit|go\s+to|drive\s+to|attend|inspect|survey|install|measure|pickup|pick-?up|drop-?off|deliver|walk-?through|at\s+the\s+(?:site|property|job))\b/i;

const FIELD_WORK_TYPES = new Set([
  'trades_field',
  'field',
  'field_service',
  'mobile',
  'outdoor',
  'delivery',
  'home_service',
  'site',
]);

const DESK_WORK_TYPES = new Set([
  'office',
  'remote',
  'knowledge',
  'creative',
  'admin',
  'professional_office',
]);

function near(a: Coords, b: Coords, tol = BASE_NEAR_DEG): boolean {
  return Math.abs(a.lat - b.lat) <= tol && Math.abs(a.lng - b.lng) <= tol;
}

function awayFrom(a: Coords, b: Coords, tol = AWAY_FROM_BASE_DEG): boolean {
  return Math.abs(a.lat - b.lat) > tol || Math.abs(a.lng - b.lng) > tol;
}

function hasCoords(t: VisitTaskLike): t is VisitTaskLike & { lat: number; lng: number } {
  return (
    typeof t.lat === 'number' &&
    typeof t.lng === 'number' &&
    Number.isFinite(t.lat) &&
    Number.isFinite(t.lng)
  );
}

function isFieldPrior(profile?: VisitProfilePrior | null): boolean {
  if (!profile) return false;
  if (profile.travelEmphasis) return true;
  const wt = (profile.workType ?? '').toLowerCase().trim();
  if (!wt) return false;
  if (FIELD_WORK_TYPES.has(wt)) return true;
  if (wt.includes('field') || wt.includes('trade') || wt.includes('mobile')) return true;
  return false;
}

function isDeskPrior(profile?: VisitProfilePrior | null): boolean {
  if (!profile) return false;
  const wt = (profile.workType ?? '').toLowerCase().trim();
  if (!wt) return false;
  if (DESK_WORK_TYPES.has(wt)) return true;
  if (wt.includes('office') || wt.includes('remote')) return true;
  return false;
}

/**
 * Score in roughly [-2, +3]. Threshold for must_visit: > 0.35
 */
export function visitScore(
  task: VisitTaskLike,
  opts?: VisitClassifyOpts
): number {
  if (!hasCoords(task)) return -2;

  if (task.requires_visit === true || task.on_site === true) return 3;
  if (task.requires_visit === false || task.on_site === false) return -2;

  const bases = opts?.bases;
  const here = { lat: task.lat, lng: task.lng };
  if (bases?.home && near(here, bases.home)) return -2;
  if (bases?.work && near(here, bases.work)) return -2;

  const text = (task.text ?? '').trim();
  const loc = (task.location_text ?? '').trim();
  let score = 0;

  // Universal desk/remote — strong negative for everyone.
  if (text && DESK_REMOTE_RE.test(text)) score -= 1.4;

  // Personal evidence: this person's past located work often was real travel.
  const pr = opts?.personal?.visitRate;
  const pn = opts?.personal?.samples ?? 0;
  if (pr != null && pn >= 3) {
    if (pr >= 0.65) score += 0.9;
    else if (pr >= 0.45) score += 0.45;
    else if (pr <= 0.25) score -= 0.5;
  }

  // Profile prior: field/travel-centred days lean toward visit when a pin exists.
  if (isFieldPrior(opts?.profile)) score += 0.55;
  if (isDeskPrior(opts?.profile) && !isFieldPrior(opts?.profile)) score -= 0.35;

  // Structural: user-facing place text + pin away from home/work.
  const away =
    (bases?.home ? awayFrom(here, bases.home) : true) &&
    (bases?.work ? awayFrom(here, bases.work) : true);

  if (loc.length > 0 && away) score += 0.5;
  else if (loc.length > 0) score += 0.15;

  // Pin away from base without place text (e.g. job-inherited) — weak only.
  if (loc.length === 0 && away && task.job_id) score += 0.1;
  if (loc.length === 0 && away && !task.job_id) score += 0.25;

  // Weak language nudge — never the only gate.
  if (text && PRESENCE_NUDGE_RE.test(text)) score += 0.35;

  return score;
}

export function classifyVisitIntent(
  task: VisitTaskLike,
  opts?: VisitClassifyOpts | { home?: Coords | null; work?: Coords | null }
): VisitIntent {
  // Back-compat: second arg used to be bases only.
  const normalized: VisitClassifyOpts =
    opts && ('home' in opts || 'work' in opts) && !('bases' in opts) && !('profile' in opts)
      ? { bases: opts as { home?: Coords | null; work?: Coords | null } }
      : ((opts as VisitClassifyOpts) ?? {});

  return visitScore(task, normalized) > 0.35 ? 'must_visit' : 'context_only';
}

/** True when geo-aware should treat this task as a driving stop. */
export function isRouteStop(
  task: VisitTaskLike,
  opts?: VisitClassifyOpts | { home?: Coords | null; work?: Coords | null }
): boolean {
  try {
    return classifyVisitIntent(task, opts) === 'must_visit';
  } catch {
    return false;
  }
}

/**
 * Estimate personal visit rate from history rows that had coordinates.
 * Pure heuristic until Reality Check records actual travel.
 *
 * Counts a past located completion as a "visit-shaped" sample when it was
 * not desk/remote language — field workers build a high rate quickly;
 * desk workers with occasional client pins stay low.
 */
export function personalVisitEvidenceFromHistory(
  history: Array<{
    text?: string | null;
    lat?: number | null;
    lng?: number | null;
    location_text?: string | null;
  }>,
  bases?: { home?: Coords | null; work?: Coords | null }
): VisitPersonalEvidence {
  let located = 0;
  let visitShaped = 0;
  for (const h of history) {
    if (typeof h.lat !== 'number' || typeof h.lng !== 'number') continue;
    if (!Number.isFinite(h.lat) || !Number.isFinite(h.lng)) continue;
    const here = { lat: h.lat, lng: h.lng };
    if (bases?.home && near(here, bases.home)) continue;
    if (bases?.work && near(here, bases.work)) continue;
    located += 1;
    const text = (h.text ?? '').trim();
    if (text && DESK_REMOTE_RE.test(text)) continue;
    // Located, away from base, not desk language → visit-shaped for learning.
    visitShaped += 1;
  }
  if (located < 3) return { visitRate: null, samples: located };
  return { visitRate: visitShaped / located, samples: located };
}
