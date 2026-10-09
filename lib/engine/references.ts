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

// Strong, typed references always qualify. Bare demonstratives and
// locatives qualify only when used anaphorically, not in ordinary time phrases
// ("this morning", "that week") or existential constructions ("there is a
// meeting"). False positives route complete new requests into an ambiguity
// gate before the task interpreter can act on their explicit intent.
const STRONG_REF_RE =
  /\b(the\s+last\s+one|the\s+other\s+one|the\s+previous\s+(?:one|task|job)|the\s+job|that\s+job|the\s+meeting)\b/i;
const DEMONSTRATIVE_REF_RE = /\b(this|that|it|these|those)\b/i;
const LOCATIVE_REF_RE = /\b(there|here)\b/i;
const TEMPORAL_DEMONSTRATIVE_TAIL =
  /^(?:morning|afternoon|evening|night|week|weekend|month|year|time|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/i;

function isAnaphoricDemonstrative(text: string): boolean {
  const match = DEMONSTRATIVE_REF_RE.exec(text);
  if (!match || match.index == null) return false;
  const tail = text.slice(match.index + match[0].length).trimStart();
  if (TEMPORAL_DEMONSTRATIVE_TAIL.test(tail)) return false;
  if (/^is\s+(?:a|an|the|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(tail)) {
    return false;
  }
  return true;
}

function isAnaphoricLocative(text: string): boolean {
  const match = LOCATIVE_REF_RE.exec(text);
  if (!match || match.index == null) return false;
  const before = text.slice(0, match.index).trimEnd();
  const after = text.slice(match.index + match[0].length).trimStart();
  if (/^(?:is|are|was|were|has been|have been)\b/i.test(after)) return false;
  return /\b(?:go|going|head|heading|come|coming|return|back|meet|meeting|drop|leave|put|send|drive|walk|work|stay|wait)\b/i.test(before);
}

export function containsReference(text: string): boolean {
  return STRONG_REF_RE.test(text) ||
    isAnaphoricDemonstrative(text) ||
    isAnaphoricLocative(text);
}

export function extractReferencePhrase(text: string): string | null {
  const strong = text.match(STRONG_REF_RE);
  if (strong) return strong[1].toLowerCase();
  const demo = DEMONSTRATIVE_REF_RE.exec(text);
  if (demo && demo.index != null) {
    const tail = text.slice(demo.index + demo[0].length).trimStart();
    if (!TEMPORAL_DEMONSTRATIVE_TAIL.test(tail)) return demo[1].toLowerCase();
  }
  if (isAnaphoricLocative(text)) {
    const loc = LOCATIVE_REF_RE.exec(text);
    return loc?.[1].toLowerCase() ?? null;
  }
  return null;
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

  // Ordinary anaphora is different from "last/previous": when the user
  // has an explicit conversational focus, "it/that/this" refers to that focus
  // unless the phrase itself supplies a stronger type/locative instruction.
  // Do this before salience comparison so an unrelated recent entity cannot
  // manufacture ambiguity around the active task.
  if (
    mem.currentFocus.id &&
    mem.currentFocus.label &&
    /^(?:it|that|this|these|those)$/.test(phrase)
  ) {
    const focused = pool.find((item) => item.id === mem.currentFocus.id);
    if (focused) {
      return { status: 'resolved', item: focused, reason: 'active_focus' };
    }
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
