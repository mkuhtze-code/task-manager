/**
 * Dokkit speech understanding context — optional evidence for entity resolution.
 * Never invents entities; only ranks matches already known to Dokkit.
 * Privacy: context is caller-supplied (UI/runtime); speech module does not fetch.
 */

import type { Confidence } from '../types';

export type ContextEntityKind = 'person' | 'job' | 'task' | 'meeting' | 'place' | 'quote' | 'thing';

export type ContextEntity = {
  id: string;
  label: string;
  kind: ContextEntityKind;
  aliases?: string[];
  recency?: number;
};

export type SpeechUnderstandingContext = {
  people?: ContextEntity[];
  jobs?: ContextEntity[];
  tasks?: ContextEntity[];
  meetings?: ContextEntity[];
  places?: ContextEntity[];
  focusEntityIds?: string[];
  todayIso?: string;
};

export type EntityLink = {
  entityId: string;
  label: string;
  kind: ContextEntityKind;
  matchedSpan: string;
  confidence: Confidence;
  source: 'exact' | 'alias' | 'fuzzy' | 'focus' | 'pronoun';
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function allEntities(ctx: SpeechUnderstandingContext | null | undefined): ContextEntity[] {
  if (!ctx) return [];
  return [
    ...(ctx.people ?? []),
    ...(ctx.jobs ?? []),
    ...(ctx.tasks ?? []),
    ...(ctx.meetings ?? []),
    ...(ctx.places ?? []),
  ];
}

export function scoreEntityMatch(surface: string, entity: ContextEntity): number {
  const s = norm(surface);
  if (!s) return 0;
  const label = norm(entity.label);
  if (s === label) return 1;
  if (label.includes(s) && s.length >= 3) return 0.85;
  if (s.includes(label) && label.length >= 3) return 0.8;
  for (const a of entity.aliases ?? []) {
    const an = norm(a);
    if (s === an) return 0.95;
    if (an.includes(s) && s.length >= 3) return 0.75;
    if (s.includes(an) && an.length >= 3) return 0.7;
  }
  const st = new Set(s.split(' '));
  const lt = label.split(' ');
  const overlap = lt.filter((t) => st.has(t) && t.length > 2).length;
  if (overlap > 0) return 0.5 + 0.15 * overlap + (entity.recency ?? 0) * 0.1;
  return (entity.recency ?? 0) * 0.2;
}

function confidenceFromScore(score: number): Confidence {
  if (score >= 0.85) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

export function linkEntitiesInText(
  text: string,
  ctx: SpeechUnderstandingContext | null | undefined
): EntityLink[] {
  const entities = allEntities(ctx);
  if (!entities.length || !text.trim()) return [];

  const links: EntityLink[] = [];
  const lower = text.toLowerCase();
  const candidates: string[] = [];
  const theJob = text.match(/\bthe\s+([A-Za-z][A-Za-z0-9\s-]{1,40}?)\s+job\b/gi);
  if (theJob) candidates.push(...theJob);
  const theMeet = text.match(/\bthe\s+([A-Za-z][A-Za-z0-9\s-]{1,40}?)\s+meeting\b/gi);
  if (theMeet) candidates.push(...theMeet);
  const proper = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g);
  if (proper) candidates.push(...proper);
  for (const e of entities) {
    for (const a of [e.label, ...(e.aliases ?? [])]) {
      if (a.length >= 2 && lower.includes(a.toLowerCase())) candidates.push(a);
    }
  }

  const seen = new Set<string>();
  for (const span of candidates) {
    const key = norm(span);
    if (seen.has(key) || key.length < 2) continue;
    seen.add(key);
    let best: { e: ContextEntity; score: number } | null = null;
    for (const e of entities) {
      const sc = scoreEntityMatch(span, e);
      if (!best || sc > best.score) best = { e, score: sc };
    }
    if (!best || best.score < 0.55) continue;
    const source: EntityLink['source'] =
      best.score >= 0.95
        ? norm(span) === norm(best.e.label)
          ? 'exact'
          : 'alias'
        : best.score >= 0.7
          ? 'alias'
          : 'fuzzy';
    links.push({
      entityId: best.e.id,
      label: best.e.label,
      kind: best.e.kind,
      matchedSpan: span,
      confidence: confidenceFromScore(best.score),
      source,
    });
  }

  links.sort((a, b) => {
    const order = { high: 2, medium: 1, low: 0 };
    return order[b.confidence] - order[a.confidence];
  });
  const unique: EntityLink[] = [];
  const used = new Set<string>();
  for (const l of links) {
    if (used.has(l.entityId)) continue;
    used.add(l.entityId);
    unique.push(l);
  }
  return unique;
}

export function resolveFocusReference(
  pronoun: string,
  ctx: SpeechUnderstandingContext | null | undefined
): EntityLink | null {
  if (!ctx?.focusEntityIds?.length) return null;
  const p = pronoun.toLowerCase();
  if (!['it', 'that', 'this'].includes(p)) return null;

  const entities = allEntities(ctx);
  const focused = ctx.focusEntityIds
    .map((id) => entities.find((e) => e.id === id))
    .filter(Boolean) as ContextEntity[];

  if (focused.length === 1) {
    return {
      entityId: focused[0].id,
      label: focused[0].label,
      kind: focused[0].kind,
      matchedSpan: pronoun,
      confidence: 'high',
      source: 'focus',
    };
  }
  if (focused.length > 1) {
    const nonPerson = focused.filter((e) => e.kind !== 'person');
    const pick = nonPerson[0] ?? focused[0];
    return {
      entityId: pick.id,
      label: pick.label,
      kind: pick.kind,
      matchedSpan: pronoun,
      confidence: nonPerson.length === 1 ? 'medium' : 'low',
      source: 'focus',
    };
  }
  return null;
}

export function emptySpeechContext(): SpeechUnderstandingContext {
  return {};
}
