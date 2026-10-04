/**
 * Multi-item extraction from natural language enumerations.
 * Deterministic — no LLM.
 */

import { collapseWhitespace, normalizeItemContent } from './normalize';
import type { CollectionItemInput } from './types';

const LIST_LEADINS = [
  /^(?:i\s+)?(?:also\s+)?(?:need|want|got|have)\s+/i,
  /^(?:don't|dont)\s+forget\s+/i,
  /^(?:one\s+more\s+thing|another\s+thing)[,\s—\-–]+/i,
  /^(?:oh,?\s+)?(?:and|also|plus)\s+/i,
  /^(?:and|also|plus)\s+/i,
];

const ENUM_PREFIX = /^(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)[,.\s]+/i;
const NUMBERED = /^\d+[.)]\s*/;

/** Split a list body into item strings. */
export function splitItemEnumeration(raw: string): string[] {
  let text = collapseWhitespace(raw);
  if (!text) return [];

  // "I've got three things: a, b and c" → body after colon
  const colon = text.match(/^[^:]{0,80}:\s*(.+)$/);
  if (colon) text = colon[1];

  // Prefer comma splits when present
  if (/,/.test(text)) {
    const parts = text
      .split(/,|\band\b|\bplus\b/i)
      .map((p) => collapseWhitespace(p))
      .filter(Boolean)
      .map(stripLeadIn);
    return dedupeAdjacent(parts.filter((p) => p.length > 0));
  }

  // "a and b and c" without commas
  if (/\band\b/i.test(text)) {
    const parts = text
      .split(/\band\b|\bplus\b/i)
      .map((p) => collapseWhitespace(p))
      .filter(Boolean)
      .map(stripLeadIn);
    if (parts.length > 1) return dedupeAdjacent(parts.filter((p) => p.length > 0));
  }

  // Numbered / first-second-third lines
  if (ENUM_PREFIX.test(text) || NUMBERED.test(text) || /\.\s+(?:First|Second|Third)/i.test(text)) {
    const parts = text
      .split(/(?:(?:^|\.\s*)(?:First|Second|Third|Fourth|Fifth|1st|2nd|3rd|4th|5th)[,.\s]+|\d+[.)]\s*)/i)
      .map((p) => collapseWhitespace(p))
      .filter(Boolean)
      .map(stripLeadIn);
    if (parts.length > 1) return dedupeAdjacent(parts.filter((p) => p.length > 0));
  }

  return [stripLeadIn(text)].filter((p) => p.length > 0);
}

function stripLeadIn(s: string): string {
  let t = collapseWhitespace(s);
  for (const re of LIST_LEADINS) t = t.replace(re, '');
  t = t.replace(ENUM_PREFIX, '');
  t = t.replace(NUMBERED, '');
  t = t.replace(/^[\-–—•]\s*/, '');
  return collapseWhitespace(t);
}

function dedupeAdjacent(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && normalizeItemContent(out[out.length - 1]) === normalizeItemContent(p)) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export function itemsFromText(raw: string, source = 'speech'): CollectionItemInput[] {
  return splitItemEnumeration(raw).map((content) => ({
    content,
    source,
    metadata: {},
  }));
}

/** Very short single-token continuations often used while a list is active. */
export function looksLikeImplicitItem(text: string): boolean {
  const t = collapseWhitespace(text);
  if (!t) return false;
  // Avoid sentences that look like full tasks
  if (/\b(need to|have to|should|must|please|remind|schedule|meeting)\b/i.test(t)) {
    return false;
  }
  // Done-state utterances are completions, never new items
  if (
    /\b(?:is|are|was|were)\s+(?:done|complete|completed|finished|sorted|dealt\s+with|handled)\b/i.test(
      t
    ) ||
    /\b(?:done|finished|sorted(?:\s+out)?|dealt\s+with|handled|taken\s+care\s+of)\s*$/i.test(t)
  ) {
    return false;
  }
  if (t.length > 80) return false;
  // Single phrase / short enumeration
  const items = splitItemEnumeration(t);
  if (items.length >= 2) return true;
  if (items.length === 1 && items[0].split(/\s+/).length <= 8) return true;
  return false;
}
