/**
 * Visit intent — location ≠ must travel.
 *
 * A task can carry place/job coordinates as *context* (quotes, calls, admin
 * for a site job) without requiring the person to drive there today.
 * Geo-aware routing must only count stops with positive visit evidence.
 *
 * Default is conservative for capacity: when unsure, do **not** invent drive time.
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
  /** Optional explicit flag if/when the column exists. */
  requires_visit?: boolean | null;
  on_site?: boolean | null;
};

/** ~400 m — same pin as home/work is not a separate stop. */
const BASE_NEAR_DEG = 0.004;

const MUST_VISIT_RE =
  /\b(on[\s-]?site|onsite|site\s+visit|go\s+to|drive\s+to|head\s+to|attend|inspect(\s+at)?|survey(\s+at)?|install\s+at|meet\s+(at|with)|pickup|pick[\s-]?up|drop[\s-]?off|deliver(\s+to)?|visit\s+(the|site|client)|at\s+the\s+(site|property|job)|walkthrough|walk[\s-]?through|measure\s+up|quote\s+on[\s-]?site)\b/i;

const CONTEXT_ONLY_RE =
  /\b(call|phone|email|e[\s-]?mail|message|text|zoom|teams|meet\s+online|invoice|quote\s+(for|the)|order|purchase|buy|draft|write|review|plan|schedule|book|admin|paperwork|follow[\s-]?up|chase|confirm|send|reply|research|design|draw|spec|cost(ing)?|estimate\s+for)\b/i;

function near(a: Coords, b: Coords, tol = BASE_NEAR_DEG): boolean {
  return Math.abs(a.lat - b.lat) <= tol && Math.abs(a.lng - b.lng) <= tol;
}

function hasCoords(t: VisitTaskLike): t is VisitTaskLike & { lat: number; lng: number } {
  return (
    typeof t.lat === 'number' &&
    typeof t.lng === 'number' &&
    Number.isFinite(t.lat) &&
    Number.isFinite(t.lng)
  );
}

/**
 * Classify whether this task should enter the geo route as a physical stop.
 */
export function classifyVisitIntent(
  task: VisitTaskLike,
  bases?: { home?: Coords | null; work?: Coords | null }
): VisitIntent {
  if (!hasCoords(task)) return 'context_only';

  if (task.requires_visit === true || task.on_site === true) return 'must_visit';
  if (task.requires_visit === false || task.on_site === false) return 'context_only';

  const text = (task.text ?? '').trim();

  // Already at home/work pin — not a travel stop for the day.
  const here = { lat: task.lat, lng: task.lng };
  if (bases?.home && near(here, bases.home)) return 'context_only';
  if (bases?.work && near(here, bases.work)) return 'context_only';

  if (text.length > 0 && MUST_VISIT_RE.test(text)) return 'must_visit';
  if (text.length > 0 && CONTEXT_ONLY_RE.test(text)) return 'context_only';

  // Coordinates alone (e.g. inherited from a job match) are context, not a trip.
  // Location text without visit language is still context.
  return 'context_only';
}

/** True when geo-aware should treat this task as a driving stop. */
export function isRouteStop(
  task: VisitTaskLike,
  bases?: { home?: Coords | null; work?: Coords | null }
): boolean {
  try {
    return classifyVisitIntent(task, bases) === 'must_visit';
  } catch {
    return false;
  }
}
