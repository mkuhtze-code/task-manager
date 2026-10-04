/**
 * Resolve "for Smith Street" style hints to job/meeting ids.
 */
import { normalizeKey } from './normalize';
import type { CollectionContextType, CollectionDetectContext } from './types';

export type ContextLink = {
  contextType: NonNullable<CollectionContextType>;
  contextId: string;
};

export function resolveContextLink(
  hint: string | undefined | null,
  ctx?: CollectionDetectContext | null
): ContextLink | null {
  if (!hint || !ctx) return null;
  const key = normalizeKey(hint);
  if (!key) return null;

  const jobs = ctx.jobs ?? [];
  const jobHits = jobs.filter((j) => {
    const n = normalizeKey(j.name);
    return n === key || n.includes(key) || key.includes(n);
  });
  if (jobHits.length === 1) {
    return { contextType: 'job', contextId: jobHits[0].id };
  }

  const meetings = ctx.meetings ?? [];
  const meetHits = meetings.filter((m) => {
    const n = normalizeKey(m.text);
    return n === key || n.includes(key) || key.includes(n);
  });
  if (meetHits.length === 1) {
    return { contextType: 'meeting', contextId: meetHits[0].id };
  }

  return null;
}
