// lib/unifiedInput/resolve.ts
//
// Resolves a unified thought's location/job facet against the user's EXISTING
// jobs. Purely deterministic fuzzy matching over the jobs the user already
// has — it never creates a job, address, category, or person.
//
// Output is a discrete state so the caller (and the user) always knows how
// much to trust the result, following the existing DecisionAuthority
// discipline:
//   'none'     → no reliable candidate; leave the relationship unresolved
//   'proposed' → exactly one reliable candidate; ask to confirm it
//   'choose'   → several plausible candidates; let the user pick
//
// Road abbreviations ("rd", "st", "ave") are normalised to full words so
// "Belgium Rd" matches a job named "Belgium Road" or located at "14 Belgium
// Road".

import type { ThoughtParts } from '@/lib/unifiedInput/parse';
import type { Job } from '@/lib/jobTypes';

export type JobLocationCandidate = {
  jobId: string;
  jobName: string;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  matchedField: 'name' | 'location';
  score: number;
};

export type JobLocationResolution =
  | { state: 'none'; candidates: JobLocationCandidate[] }
  | { state: 'proposed'; candidate: JobLocationCandidate; candidates: JobLocationCandidate[] }
  | { state: 'choose'; candidates: JobLocationCandidate[] };

// Generic words that don't help identify a place, so "the road" never looks
// like a reliable match on its own.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'at', 'on', 'to', 'for', 'my', 'and', 'or', 'of', 'in',
  'with', 'near', 'by', 'this', 'that', 'it', 'up', 'out', 'road', 'street',
  'avenue', 'lane', 'drive', 'way', 'next', 'around', 'some',
]);

const ROAD_ALIASES: Record<string, string> = {
  rd: 'road', st: 'street', ave: 'avenue', ln: 'lane', dr: 'drive',
  blvd: 'boulevard', pl: 'place', ct: 'court', rte: 'route', hwy: 'highway',
  terr: 'terrace', cres: 'crescent',
};

function normalizeMatchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\./g, ' ')
    .split(/[\s,]+/)
    .map((w) => ROAD_ALIASES[w] ?? w)
    .filter((w) => w.length > 0);
}

function distinctTokens(value: string): string[] {
  const seen = new Set<string>();
  for (const w of normalizeMatchText(value)) {
    if (!STOPWORDS.has(w)) seen.add(w);
  }
  return [...seen];
}

// Progressive token match: a query token counts as a hit when it equals a
// business/job token, OR when it is a short leading fragment of one. This is
// how a bare, suffix-less short name resolves against the fuller entity — e.g.
// "Gladstone" (or even "Glads") → a job named "Gladstone Street" or located at
// "Gladstone Road". Only the SHORT→LONG direction is allowed (the query token
// is a prefix of the field token), so a vague query never out-matches a more
// specific job token, and a minimum length keeps 2–3 letter noise from firing.
function tokenMatchesFieldToken(queryToken: string, fieldToken: string): boolean {
  if (queryToken === fieldToken) return true;
  if (queryToken.length < 3) return false;
  return fieldToken.startsWith(queryToken);
}

function candidateScore(queryTokens: Set<string>, fieldText: string): number {
  const fieldTokens = distinctTokens(fieldText);
  if (fieldTokens.length === 0) return 0;
  let hits = 0;
  for (const t of queryTokens) {
    if (fieldTokens.some((f) => tokenMatchesFieldToken(t, f))) hits += 1;
  }
  if (hits === 0) return 0;
  // Score favours meaningful shared tokens, tempered by how much of the
  // field we did NOT match (so a long generic location doesn't look perfect).
  return hits / (hits + (fieldTokens.length - hits));
}

export function resolveJobAndLocation(
  parts: ThoughtParts,
  jobs: Job[],
): JobLocationResolution {
  const querySource = parts.locationHint && parts.locationHint.length > 0
    ? parts.locationHint
    : parts.intent;
  const queryTokens = new Set(distinctTokens(querySource));
  if (queryTokens.size === 0 || jobs.length === 0) {
    return { state: 'none', candidates: [] };
  }

  const candidates: JobLocationCandidate[] = [];

  for (const job of jobs) {
    const nameScore = candidateScore(queryTokens, job.name);
    let locationScore = 0;
    let locationText = job.location_text ?? null;
    if (job.location_text) {
      locationScore = candidateScore(queryTokens, job.location_text);
    }

    if (nameScore <= 0 && locationScore <= 0) continue;

    // A single candidate can match by name and/or location. When the job has
    // a location, prefer surfacing that concrete address ("Do you mean 14
    // Belgium Road?") over the bare job name — it is the more specific,
    // more useful confirmation. Name-only matches fall back to the name.
    const bestScore = Math.max(nameScore, locationScore);
    const matchedField: 'name' | 'location' =
      locationText && locationScore > 0 ? 'location' : 'name';

    candidates.push({
      jobId: job.id,
      jobName: job.name,
      locationText,
      lat: job.lat,
      lng: job.lng,
      matchedField,
      score: bestScore,
    });
  }

  if (candidates.length === 0) return { state: 'none', candidates: [] };

  // Drop weak matches whose shared token is only a generic stop word.
  const reliable = candidates.filter((c) => c.score > 0 && c.score >= 0.34);
  if (reliable.length === 0) return { state: 'none', candidates: [] };

  reliable.sort((a, b) => b.score - a.score);

  if (reliable.length === 1) {
    return { state: 'proposed', candidate: reliable[0], candidates: reliable };
  }
  return { state: 'choose', candidates: reliable };
}
