/**
 * Active collection context with sensible decay.
 * Active must not stay dominant forever.
 */

import type { ActiveCollectionState, Collection } from './types';

/** Default: active soft-expires after 2 hours without interaction. */
export const ACTIVE_SOFT_TTL_MS = 2 * 60 * 60 * 1000;
/** Hard: after 24h never use active for implicit continuation. */
export const ACTIVE_HARD_TTL_MS = 24 * 60 * 60 * 1000;

export function emptyActiveState(): ActiveCollectionState {
  return {
    collectionId: null,
    activatedAt: null,
    lastInteractionAt: null,
    surface: null,
  };
}

export function activateCollection(
  state: ActiveCollectionState,
  collectionId: string,
  now = Date.now(),
  surface?: string | null
): ActiveCollectionState {
  const iso = new Date(now).toISOString();
  return {
    collectionId,
    activatedAt: state.collectionId === collectionId ? state.activatedAt ?? iso : iso,
    lastInteractionAt: iso,
    surface: surface ?? state.surface ?? null,
  };
}

export function touchActive(
  state: ActiveCollectionState,
  now = Date.now()
): ActiveCollectionState {
  if (!state.collectionId) return state;
  return {
    ...state,
    lastInteractionAt: new Date(now).toISOString(),
  };
}

export function clearActive(): ActiveCollectionState {
  return emptyActiveState();
}

export type ActiveEligibility =
  | { eligible: true; reason: 'fresh' | 'soft' }
  | { eligible: false; reason: 'none' | 'hard_expired' | 'soft_expired' };

export function evaluateActiveEligibility(
  state: ActiveCollectionState,
  now = Date.now()
): ActiveEligibility {
  if (!state.collectionId || !state.lastInteractionAt) {
    return { eligible: false, reason: 'none' };
  }
  const last = Date.parse(state.lastInteractionAt);
  if (!Number.isFinite(last)) return { eligible: false, reason: 'none' };
  const age = now - last;
  if (age > ACTIVE_HARD_TTL_MS) return { eligible: false, reason: 'hard_expired' };
  if (age > ACTIVE_SOFT_TTL_MS) return { eligible: false, reason: 'soft_expired' };
  if (age > ACTIVE_SOFT_TTL_MS / 2) return { eligible: true, reason: 'soft' };
  return { eligible: true, reason: 'fresh' };
}

/** Whether implicit continuation (bare "Milk.") may use active. */
export function canUseActiveForImplicit(
  state: ActiveCollectionState,
  now = Date.now()
): boolean {
  const e = evaluateActiveEligibility(state, now);
  return e.eligible;
}

export function pickActiveCollection(
  state: ActiveCollectionState,
  collections: Collection[],
  now = Date.now()
): Collection | null {
  if (!canUseActiveForImplicit(state, now) || !state.collectionId) return null;
  const found = collections.find(
    (c) => c.id === state.collectionId && c.status === 'open'
  );
  return found ?? null;
}
