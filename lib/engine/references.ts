/**
 * Deterministic referential resolution: this / that / it / the last one …
 * Never silently picks when ambiguity is high.
 */

import type { MemoryItem, WorkingMemorySnapshot } from './types';
import { allReferents } from './workingMemory';

export type ReferenceResolution =
  | { status: 'resolved'; item: MemoryItem; reason: string }
  | { status: 'ambiguous'; candidates: MemoryItem[]; reason: string }
  | { status: 'unknown'; reason: string };

const REF_RE =
  /\b(this|that|it|these|those|the\s+last\s+one|the\s+other\s+one|the\s+previous\s+(?:one|task|job)|the\s+job|that\s+job|the\s+meeting|there|here)\b/i;

export function containsReference(text: string): boolean {
  return REF_RE.test(text);
}

export function extractReferencePhrase(text: string): string | null {
  const m = text.match(REF_RE);
  return m ? m[1].toLowerCase() : null;
}

function prefersType(phrase: string): MemoryItem['type'][] | null {
  if (/job/.test(phrase)) return ['job'];
  if (/meeting/.test(phrase)) return ['meeting', 'entity'];
  if (/task|one/.test(phrase)) return ['task', 'list_item', 'request'];
  if (/there|here/.test(phrase)) return ['location', 'job'];
  return null;
}

/**
 * Rank candidates for a referential phrase given working memory + focus.
 */
export function resolveReference(
  text: string,
  mem: WorkingMemorySnapshot,
  opts?: {
    preferTypes?: MemoryItem['type'][];
    extraReferents?: MemoryItem[];
  }
): ReferenceResolution {
  const phrase = extractReferencePhrase(text);
  if (!phrase) return { status: 'unknown', reason: 'no_reference_phrase' };

  const prefer = opts?.preferTypes ?? prefersType(phrase);
  const seen = new Set<string>();

  // Utterance transcripts are evidence about what was said, not referents.
  // Treating the current utterance as an antecedent makes a bare "it" look
  // resolved even when the user has supplied no prior object.
  let pool = [...(opts?.extraReferents ?? []), ...allReferents(mem)].filter((item) => {
    if (item.type === 'utterance') return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  if (mem.currentFocus.id && mem.currentFocus.label) {
    const focusItem: MemoryItem = {
      id: mem.currentFocus.id,
      type:
        mem.currentFocus.kind === 'job'
          ? 'job'
          : mem.currentFocus.kind === 'list' || mem.currentFocus.kind === 'task'
            ? 'task'
            : mem.currentFocus.kind === 'meeting'
              ? 'meeting'
              : 'entity',
      label: mem.currentFocus.label,
      source: 'focus',
      timestamp: mem.updatedAt,
      salience: 1,
      confidence: 'high',
      relationships: {},
    };
    pool = [focusItem, ...pool.filter((p) => p.id !== focusItem.id)];
  }

  if (prefer) {
    const typed = pool.filter((p) => prefer.includes(p.type));
    if (typed.length > 0) pool = typed;
  }

  if (/^(?:there|here)$/.test(phrase)) {
    const locs = pool.filter((item) => item.type === 'location' || item.type === 'job');
    const loc = [...locs].sort((a, b) => {
      const salienceDelta = b.salience - a.salience;
      if (salienceDelta !== 0) return salienceDelta;
      return Date.parse(b.timestamp) - Date.parse(a.timestamp);
    })[0];
    if (loc) return { status: 'resolved', item: loc, reason: 'locative_recency' };
    return { status: 'unknown', reason: 'no_location_antecedent' };
  }

  if (/last|previous/.test(phrase)) {
    const sorted = [...pool].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    );
    if (sorted[0]) return { status: 'resolved', item: sorted[0], reason: 'recency_last' };
  }

  if (/other/.test(phrase)) {
    if (pool.length >= 2) return { status: 'resolved', item: pool[1], reason: 'other_of_pair' };
    if (pool.length === 1) return { status: 'ambiguous', candidates: pool, reason: 'other_needs_pair' };
  }

  if (pool.length === 0) return { status: 'unknown', reason: 'empty_memory' };

  if (pool.length === 1 || pool[0].salience >= (pool[1]?.salience ?? 0) + 0.25) {
    return { status: 'resolved', item: pool[0], reason: 'salience_leader' };
  }

  if (pool.length >= 2 && Math.abs(pool[0].salience - pool[1].salience) < 0.2) {
    return { status: 'ambiguous', candidates: pool.slice(0, 3), reason: 'close_salience' };
  }

  return { status: 'resolved', item: pool[0], reason: 'best_available' };
}
