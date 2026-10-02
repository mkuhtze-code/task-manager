/**
 * Semantic correction detection — distinguish genuine corrections from discourse.
 * Uses candidate spans + facets, not blind regex replace of whole clauses.
 */

import type { CorrectionStep } from './types';

/**
 * Discourse "actually" — sentence-initial emphasis, not mid-stream correction.
 * "I actually need to call John" — actually is adverbial, not a correction marker.
 */
export function isDiscourseActuallyUse(text: string, markerIndex: number): boolean {
  const before = text.slice(0, markerIndex).trim();
  const after = text.slice(markerIndex).trim();

  if (before.length === 0 || /[.!?]\s*$/.test(before)) {
    if (!/,?\s+\w+.+\b(?:actually|sorry|i mean)\b/i.test(after)) {
      return true;
    }
  }

  if (/\b(?:i|we|they|you|he|she)\s+$/i.test(before + ' ')) {
    return true;
  }
  if (/\b(?:i|we)\s+actually\s+(?:need|want|should|have|think|do)\b/i.test(text)) {
    return true;
  }

  return false;
}

function facetOf(from: string, to: string): CorrectionStep['facet'] {
  const both = `${from} ${to}`.toLowerCase();
  if (
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|week)\b/.test(
      both
    )
  ) {
    return 'date';
  }
  if (
    /\b(?:\d{1,2}(?::\d{2})?|noon|midnight|morning|afternoon|o'?clock|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(
      both
    )
  ) {
    return 'time';
  }
  if (/^(?:call|meet|email|send|order|book)\b/i.test(from) || /^(?:call|meet)/i.test(to)) {
    return 'action';
  }
  if (/^[A-Z][a-z]+/.test(from) || /^[A-Z][a-z]+/.test(to)) return 'entity';
  return 'generic';
}

export function extractSemanticCorrections(text: string): CorrectionStep[] {
  const steps: CorrectionStep[] = [];
  const lower = text;

  const patterns: { re: RegExp; marker: string }[] = [
    {
      re: /\b(.{1,40}?)[,\s—-]+(?:actually|sorry|i\s+mean|rather|instead|wait|make\s+that|change\s+that)[,\s—-]+(.{1,40}?)(?=[.!?]|$)/gi,
      marker: 'actually',
    },
    {
      re: /\b(.{1,30}?)[,\s—-]+no[,\s—-]+(.{1,30}?)(?=[.!?]|$)/gi,
      marker: 'no',
    },
  ];

  let order = 0;
  for (const { re, marker } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const from = m[1].trim();
      const to = m[2].trim();
      if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue;

      if (marker === 'actually' && isDiscourseActuallyUse(text, m.index)) continue;

      if (marker === 'no' && /\b(?:said|say|told|tell)\b/i.test(from)) continue;
      if (marker === 'no' && from.split(/\s+/).length > 6) continue;

      if (
        marker === 'actually' &&
        /^(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+)$/i.test(
          to
        ) &&
        /\b(?:need|call|email|meet)\b/i.test(from) &&
        from.split(/\s+/).length > 3
      ) {
        continue;
      }

      steps.push({
        from,
        to,
        marker,
        facet: facetOf(from, to),
        order: order++,
      });
    }
  }

  return steps;
}

export function applyCorrectionsToClause(clause: string): {
  text: string;
  steps: CorrectionStep[];
} {
  const steps = extractSemanticCorrections(clause);
  if (steps.length === 0) return { text: clause, steps: [] };

  let text = clause;
  const byFacet = new Map<string, CorrectionStep>();
  for (const s of steps) {
    byFacet.set(s.facet, s);
  }
  for (const s of byFacet.values()) {
    if (text.toLowerCase().includes(s.from.toLowerCase())) {
      const idx = text.toLowerCase().indexOf(s.from.toLowerCase());
      text = text.slice(0, idx) + s.to + text.slice(idx + s.from.length);
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), steps };
}
