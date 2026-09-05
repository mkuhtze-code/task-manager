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
//   'known'    → the input carries a user-confirmed relationship and it was
//                applied automatically; do not ask
//   'proposed' → exactly one reliable candidate; ask to confirm it
//   'choose'   → several plausible candidates; let the user pick
//
// Road abbreviations ("rd", "st", "ave") are normalised to full words so
// "Belgium Rd" matches a job named "Belgium Road" or located at "14 Belgium
// Road".
//
// V1.2 — persistent entity relationships. The resolver stays generic; the
// only thing it gains is an optional `memory` of the user's previously
// confirmed relationships (alias → entity). Those are DATA the resolver
// consults, never parser rules. Precedence:
//   1. the confirmed relationship, when it is unambiguous and the input does
//      not textually identify a different entity more strongly (→ 'known')
//   2. the same relationship, genuinely ambiguous across several entities
//      (→ 'choose'; still nothing is silently forced)
//   3. fuzzy textual matching, exactly as V1.1 (→ 'proposed' / 'choose')
//   4. nothing reliable (→ 'none')
// A relationship whose entity is no longer active (per the existing job
// lifecycle) is treated as expired and falls back to step 3.

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
  | { state: 'choose'; candidates: JobLocationCandidate[] }
  // 'known' → the input carries a user-confirmed relationship that the
  // resolver has applied, so the caller should NOT ask for confirmation.
  | { state: 'known'; candidate: JobLocationCandidate; candidates: JobLocationCandidate[] };

// A confirmed relationship: typing `alias` means the user's entity of
// entity_type with id entityId. This is learned user knowledge — it is DATA
// the resolver consults, never a parser rule hardcoded anywhere. `active`
// lets the caller retain a relationship while taking it out of use (the
// resolver only consults active ones); false prevents it from firing without
// needing a full alias-management UI.
export type EntityAliasMemory = {
  alias: string;
  entityType: 'job';
  entityId: string;
  active?: boolean;
};

// Everything the resolver knows about the user's confirmed relationships,
// plus which entities the existing lifecycle still considers active. A
// relationship to an entity that is no longer active is treated as expired
// (it falls back to the normal fuzzy flow, which still asks).
export type EntityRelationshipMemory = {
  aliases: EntityAliasMemory[];
  // When provided, an entity absent from this set is considered inactive and
  // its confirmed relationships do NOT fire. Derived from the same
  // lifecycle used everywhere else (a job is inactive when it has tasks and
  // all of them are done). Omitted = every given job counts as active.
  activeEntityIds?: ReadonlySet<string>;
};

// True when a resolution produced a relationship worth surfacing to the user.
// The entity/job facet is INDEPENDENT of the date/time/priority facets: a
// proposed or choose outcome is enough for the UI to show the interpretation
// panel (and its "Do you mean ...?" confirmation) even when no other facet was
// detected from the thought. The absence of a date must never hide a
// recognisable job/location.
export function hasEntityResolution(res: JobLocationResolution | null): boolean {
  return res !== null && (res.state === 'proposed' || res.state === 'choose');
}

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

// Normalizes a confirmed trigger term exactly like match fields are
// normalized (lower-case, road abbreviations expanded), so "Belgium Rd" and
// "Belgium Road" are stored and looked up as the same relationship.
export function normalizeAliasPhrase(value: string): string {
  const tokens = normalizeMatchText(value);
  return tokens.length > 0 ? tokens.join(' ') : value.trim().toLowerCase();
}

function distinctAliasTokens(alias: string, cache: Map<string, string[]>): string[] {
  const hit = cache.get(alias);
  if (hit) return hit;
  const tokens = normalizeMatchText(alias);
  cache.set(alias, tokens);
  return tokens;
}

// A confirmed alias applies when every distinctive token of the alias appears
// in the query. Progressive short→long prefixes are allowed (the user typed a
// fragment of the term they taught), mirroring the fuzzy matcher's rule. The
// reverse direction — a longer query token prefix-matching the alias — is NOT
// allowed: the user must type at least the term they actually confirmed.
//
// Matching deliberately uses the FULL token sets (road abbreviations already
// expanded), NOT the stopword-filtered token set: for a confirmed relationship
// the road word IS meaningful ("belgium road" must match the road hint
// "Belgium Rd" even though the fuzzy matcher would drop "road" as generic).
function aliasMatchesQuery(aliasTokens: string[], queryTokens: Set<string>): boolean {
  if (aliasTokens.length === 0) return false;
  return aliasTokens.every((a) => [...queryTokens].some((q) => tokenMatchesFieldToken(q, a)));
}

// The confirmed relationships whose term the query actually contains, each
// mapped to the candidate it resolves to when that entity is present and
// still active. Memory entries that no longer point at a real, reliable
// candidate (or that point at a finished entity) are dropped here.
function matchesForConfirmedAliases(
  memory: EntityRelationshipMemory,
  reliable: JobLocationCandidate[],
  aliasQueryTokens: Set<string>,
): JobLocationCandidate[] {
  const cache = new Map<string, string[]>();
  const known: JobLocationCandidate[] = [];
  for (const alias of memory.aliases) {
    if (alias.entityType !== 'job') continue;
    if (alias.active === false) continue;
    const candidate = reliable.find((c) => c.jobId === alias.entityId);
    if (!candidate) continue;
    if (memory.activeEntityIds && !memory.activeEntityIds.has(alias.entityId)) continue;
    if (!aliasMatchesQuery(distinctAliasTokens(alias.alias, cache), aliasQueryTokens)) continue;
    if (!known.some((k) => k.jobId === candidate.jobId)) known.push(candidate);
  }
  return known;
}

// The trigger term the user typed that the confirmed relationship should
// remember: the distinctive query token(s) that matched the candidate's
// matched field. So "new tap for Kitchen" → alias "kitchen", and "Belgium Rd
// tomorrow at 10am" → alias "belgium road". Like alias matching, this uses
// the full (road-expanded) token sets, so a matched road word is preserved.
export function deriveAliasTerm(parts: ThoughtParts, candidate: JobLocationCandidate): string {
  const querySource = parts.locationHint && parts.locationHint.length > 0
    ? parts.locationHint
    : parts.intent;
  const queryTokens = normalizeMatchText(querySource);
  const fieldText = candidate.matchedField === 'location' && candidate.locationText
    ? candidate.locationText
    : candidate.jobName;
  const fieldTokens = normalizeMatchText(fieldText);
  const hits = queryTokens.filter((q) =>
    fieldTokens.some((f) => tokenMatchesFieldToken(q, f))
  );
  return hits.length > 0 ? hits.join(' ') : normalizeAliasPhrase(querySource);
}

export function resolveJobAndLocation(
  parts: ThoughtParts,
  jobs: Job[],
  memory?: EntityRelationshipMemory,
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

  // V1.2: user-confirmed relationships. A confirmed term has strong authority
  // over a merely fuzzy textual match — but ONLY when it is unambiguous and
  // the input does not textually identify a different entity more strongly.
  // Genuine ambiguity stays ambiguous (the "Which one?" flow), and a
  // relationship to an entity the lifecycle no longer considers active
  // expires instead of forcing it.
  if (memory && memory.aliases.length > 0) {
    const aliasQueryTokens = new Set(normalizeMatchText(querySource));
    const known = matchesForConfirmedAliases(memory, reliable, aliasQueryTokens);
    if (known.length > 0) {
      const bestKnown = Math.max(...known.map((c) => c.score));
      const explicitlyStronger = reliable.some(
        (c) => !known.some((k) => k.jobId === c.jobId) && c.score > bestKnown,
      );
      if (!explicitlyStronger) {
        if (known.length === 1) {
          return { state: 'known', candidate: known[0], candidates: reliable };
        }
        return { state: 'choose', candidates: known };
      }
    }
  }

  if (reliable.length === 1) {
    return { state: 'proposed', candidate: reliable[0], candidates: reliable };
  }
  return { state: 'choose', candidates: reliable };
}
