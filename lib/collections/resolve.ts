/**
 * Collection resolution — never silently merge ambiguous collections.
 */

import {
  normalizeTitle,
  normalizeKey,
  tokenSimilarity,
  COLLECTION_ALIAS_SEEDS,
} from './normalize';
import { canUseActiveForImplicit, type ActiveCollectionState } from './active';
import type {
  Collection,
  CollectionResolution,
  CollectionTarget,
  CollectionDetectContext,
  Confidence,
} from './types';

function confFromScore(score: number): Confidence {
  if (score >= 0.9) return 'high';
  if (score >= 0.65) return 'medium';
  return 'low';
}

export function resolveCollection(
  spokenReference: string | null | undefined,
  collections: Collection[],
  opts?: {
    active?: ActiveCollectionState | null;
    contextType?: string | null;
    contextId?: string | null;
    preferOpen?: boolean;
    now?: number;
  }
): CollectionResolution {
  const preferOpen = opts?.preferOpen !== false;
  const pool = preferOpen
    ? collections.filter((c) => c.status === 'open' || c.status === 'closed')
    : collections;

  // Explicit empty → try active
  if (!spokenReference || !spokenReference.trim()) {
    return resolveActiveOrAmbiguous(pool, opts);
  }

  const spoken = normalizeKey(spokenReference);
  const spokenTitle = normalizeTitle(spokenReference);

  // 1) Exact normalized title
  const exact = pool.filter((c) => c.normalizedTitle === spokenTitle);
  if (exact.length === 1) {
    return {
      collectionId: exact[0].id,
      collection: exact[0],
      confidence: 'high',
      reason: 'explicit_title_match',
      candidates: exact,
      needsClarification: false,
    };
  }
  if (exact.length > 1) {
    return ambiguous(exact, 'explicit_title_match');
  }

  // 2) Alias match (stored + seeds)
  const aliasHits = pool.filter((c) => {
    const aliases = [
      ...c.aliases.map(normalizeKey),
      normalizeKey(c.title),
      c.normalizedTitle,
    ];
    if (aliases.includes(spoken) || aliases.includes(spokenTitle)) return true;
    // Seed: "groceries" → grocery
    const seed = COLLECTION_ALIAS_SEEDS[spoken] ?? COLLECTION_ALIAS_SEEDS[spokenTitle];
    if (seed && c.normalizedTitle === seed) return true;
    return c.aliases.some((a) => normalizeTitle(a) === spokenTitle);
  });
  if (aliasHits.length === 1) {
    return {
      collectionId: aliasHits[0].id,
      collection: aliasHits[0],
      confidence: 'high',
      reason: 'alias_match',
      candidates: aliasHits,
      needsClarification: false,
    };
  }
  if (aliasHits.length > 1) {
    return ambiguous(aliasHits, 'alias_match');
  }

  // 3) Fuzzy title
  const scored = pool
    .map((c) => ({
      c,
      score: Math.max(
        tokenSimilarity(spokenTitle, c.normalizedTitle),
        tokenSimilarity(spokenTitle, normalizeTitle(c.title)),
        ...c.aliases.map((a) => tokenSimilarity(spokenTitle, normalizeTitle(a)))
      ),
    }))
    .filter((x) => x.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1 && scored[0].score >= 0.72) {
    return {
      collectionId: scored[0].c.id,
      collection: scored[0].c,
      confidence: confFromScore(scored[0].score),
      reason: 'explicit_title_match',
      candidates: [scored[0].c],
      needsClarification: false,
    };
  }
  if (scored.length > 1 && scored[0].score - (scored[1]?.score ?? 0) < 0.12) {
    return ambiguous(
      scored.slice(0, 4).map((s) => s.c),
      'ambiguous'
    );
  }
  if (scored.length >= 1 && scored[0].score >= 0.72) {
    return {
      collectionId: scored[0].c.id,
      collection: scored[0].c,
      confidence: confFromScore(scored[0].score),
      reason: 'explicit_title_match',
      candidates: [scored[0].c],
      needsClarification: false,
    };
  }

  // 4) Context-linked
  if (opts?.contextType && opts?.contextId) {
    const ctx = pool.filter(
      (c) =>
        c.contextType === opts.contextType &&
        c.contextId === opts.contextId &&
        c.status === 'open'
    );
    if (ctx.length === 1) {
      return {
        collectionId: ctx[0].id,
        collection: ctx[0],
        confidence: 'medium',
        reason: 'context_match',
        candidates: ctx,
        needsClarification: false,
      };
    }
    if (ctx.length > 1) return ambiguous(ctx, 'context_match');
  }

  // 5) Active collection
  const activeRes = resolveActiveOrAmbiguous(pool, opts);
  if (activeRes.collectionId) return activeRes;

  // 6) Recent open collection (single)
  const open = pool
    .filter((c) => c.status === 'open')
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  if (open.length === 1 && !spokenReference.trim()) {
    return {
      collectionId: open[0].id,
      collection: open[0],
      confidence: 'low',
      reason: 'recent_collection',
      candidates: open,
      needsClarification: false,
    };
  }

  return {
    collectionId: null,
    collection: null,
    confidence: 'low',
    reason: 'no_match',
    candidates: scored.slice(0, 3).map((s) => s.c),
    needsClarification: scored.length > 1,
  };
}

function resolveActiveOrAmbiguous(
  pool: Collection[],
  opts?: {
    active?: ActiveCollectionState | null;
    now?: number;
  }
): CollectionResolution {
  const active = opts?.active;
  if (active?.collectionId && canUseActiveForImplicit(active, opts?.now)) {
    const found = pool.find((c) => c.id === active.collectionId);
    if (found) {
      return {
        collectionId: found.id,
        collection: found,
        confidence: 'high',
        reason: 'active_collection',
        candidates: [found],
        needsClarification: false,
      };
    }
  }
  return {
    collectionId: null,
    collection: null,
    confidence: 'low',
    reason: 'no_match',
    candidates: [],
    needsClarification: false,
  };
}

function ambiguous(
  candidates: Collection[],
  reason: CollectionResolution['reason']
): CollectionResolution {
  return {
    collectionId: null,
    collection: null,
    confidence: 'low',
    reason: reason === 'ambiguous' ? 'ambiguous' : reason,
    candidates,
    needsClarification: true,
  };
}

export function resolveTarget(
  target: CollectionTarget,
  collections: Collection[],
  opts?: {
    active?: ActiveCollectionState | null;
    now?: number;
  }
): CollectionResolution {
  switch (target.kind) {
    case 'id': {
      const found = collections.find((c) => c.id === target.collectionId);
      return found
        ? {
            collectionId: found.id,
            collection: found,
            confidence: 'high',
            reason: 'explicit_id',
            candidates: [found],
            needsClarification: false,
          }
        : {
            collectionId: null,
            collection: null,
            confidence: 'low',
            reason: 'no_match',
            candidates: [],
            needsClarification: false,
          };
    }
    case 'title':
      return resolveCollection(target.title, collections, opts);
    case 'active':
      return resolveActiveOrAmbiguous(collections, opts);
    case 'context':
      return resolveCollection(null, collections, {
        ...opts,
        contextType: target.contextType,
        contextId: target.contextId,
      });
    case 'unresolved':
      return resolveCollection(target.spoken, collections, opts);
    default:
      return {
        collectionId: null,
        collection: null,
        confidence: 'low',
        reason: 'no_match',
        candidates: [],
        needsClarification: false,
      };
  }
}

/** Match item references against collection items (deterministic). */
export function matchItems(
  references: string[],
  items: Array<{ id: string; content: string; normalizedContent: string; status: string }>,
  opts?: { openOnly?: boolean }
): Array<{
  reference: string;
  itemId: string | null;
  content: string | null;
  confidence: Confidence;
  needsClarification: boolean;
}> {
  const openOnly = opts?.openOnly !== false;
  const pool = openOnly ? items.filter((i) => i.status === 'open') : items;

  return references.map((ref) => {
    const n = normalizeTitle(ref); // reuse light normalise
    const exact = pool.filter(
      (i) =>
        i.normalizedContent === normalizeKey(ref).replace(/^(the|a|an)\s+/, '') ||
        i.normalizedContent === n
    );
    if (exact.length === 1) {
      return {
        reference: ref,
        itemId: exact[0].id,
        content: exact[0].content,
        confidence: 'high' as Confidence,
        needsClarification: false,
      };
    }
    const scored = pool
      .map((i) => ({
        i,
        score: tokenSimilarity(ref, i.content),
      }))
      .filter((x) => x.score >= 0.45)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 1 && scored[0].score >= 0.55) {
      return {
        reference: ref,
        itemId: scored[0].i.id,
        content: scored[0].i.content,
        confidence: confFromScore(scored[0].score),
        needsClarification: false,
      };
    }
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.1) {
      return {
        reference: ref,
        itemId: null,
        content: null,
        confidence: 'low',
        needsClarification: true,
      };
    }
    if (scored[0] && scored[0].score >= 0.55) {
      return {
        reference: ref,
        itemId: scored[0].i.id,
        content: scored[0].i.content,
        confidence: confFromScore(scored[0].score),
        needsClarification: false,
      };
    }
    return {
      reference: ref,
      itemId: null,
      content: null,
      confidence: 'low',
      needsClarification: false,
    };
  });
}

export function contextFromDetect(
  ctx: CollectionDetectContext
): { active?: ActiveCollectionState | null; contextType?: string | null; contextId?: string | null } {
  return {
    active: ctx.activeCollectionId
      ? {
          collectionId: ctx.activeCollectionId,
          activatedAt: null,
          lastInteractionAt:
            ctx.msSinceLastActivity != null
              ? new Date(Date.now() - ctx.msSinceLastActivity).toISOString()
              : new Date().toISOString(),
          surface: ctx.surface ?? null,
        }
      : null,
  };
}
