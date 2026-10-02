/**
 * Span-aware temporal candidate resolution.
 * Longest / most specific match wins; overlapping shorter matches suppressed.
 */

import type { TemporalReference } from '../types';

type SpanHit = TemporalReference & {
  start: number;
  end: number;
  specificity: number;
};

function specificityOf(t: TemporalReference): number {
  let s = t.raw.length;
  if (t.kind === 'deadline') s += 20;
  if (t.kind === 'relative_day' || t.kind === 'relative_week') s += 15;
  if (t.kind === 'clock_time') s += 12;
  if (t.kind === 'time_of_day') s += 8;
  if (t.kind === 'weekday') s += 5;
  if (t.kind === 'vague') s -= 10;
  return s;
}

function findSpan(text: string, raw: string): { start: number; end: number } | null {
  const lower = text.toLowerCase();
  const needle = raw.toLowerCase();
  const start = lower.indexOf(needle);
  if (start < 0) return null;
  return { start, end: start + needle.length };
}

export function resolveTemporalOverlaps(
  text: string,
  candidates: TemporalReference[]
): TemporalReference[] {
  if (candidates.length <= 1) return candidates;

  const hits: SpanHit[] = [];
  for (const c of candidates) {
    const span = findSpan(text, c.raw);
    if (!span) {
      hits.push({ ...c, start: 9999, end: 9999, specificity: specificityOf(c) - 50 });
      continue;
    }
    hits.push({ ...c, ...span, specificity: specificityOf(c) });
  }

  hits.sort((a, b) => b.specificity - a.specificity || b.raw.length - a.raw.length);

  const chosen: SpanHit[] = [];
  for (const h of hits) {
    const overlaps = chosen.some(
      (c) => !(h.end <= c.start || h.start >= c.end) && h.start < 9000 && c.start < 9000
    );
    if (overlaps) continue;
    chosen.push(h);
  }

  chosen.sort((a, b) => a.start - b.start);
  return chosen.map(({ start: _s, end: _e, specificity: _sp, ...rest }) => rest);
}

export function temporalForClause(
  clause: string,
  resolved: TemporalReference[]
): TemporalReference | undefined {
  const lower = clause.toLowerCase();
  const inClause = resolved.filter((t) => lower.includes(t.raw.toLowerCase()));
  if (inClause.length === 0) return undefined;
  const rank = (t: TemporalReference): number => {
    let r = t.raw.length;
    if (t.kind === 'deadline') r += 100;
    if (t.confidence === 'high') r += 30;
    if (t.confidence === 'medium') r += 10;
    if (t.isCorrection) r += 50;
    return r;
  };
  return [...inClause].sort((a, b) => rank(b) - rank(a))[0];
}

export function relationFromTemporal(
  clause: string,
  t?: TemporalReference
): import('./types').TemporalRelation {
  if (/\bby\b/i.test(clause) && t) return 'by';
  if (t?.kind === 'deadline') return 'by';
  if (/\buntil\b/i.test(clause)) return 'until';
  if (/\bnot\s+before\b/i.test(clause)) return 'not_before';
  if (/\bafter\b/i.test(clause)) return 'after';
  if (/\bbefore\b/i.test(clause)) return 'before';
  if (/\bsometime\b/i.test(clause) || t?.kind === 'vague') return 'sometime';
  if (t) return 'on';
  return 'unknown';
}
