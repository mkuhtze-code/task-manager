/**
 * Client-side collection store (localStorage) + optional Supabase dual-write.
 * Local is always written for snappy UX; remote is best-effort.
 */

import { emptyStore, applyCollectionIntent } from './service';
import type { CollectionStore, ApplyResult } from './service';
import type {
  CollectionIntent,
  CollectionDetectContext,
  Collection,
} from './types';
import {
  fetchCollectionStoreRemote,
  pushCollectionStoreRemote,
} from './remote';

const KEY_PREFIX = 'dokkit.collections.v1:';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId || 'anon'}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadCollectionStore(userId: string): CollectionStore {
  if (!canUseStorage()) return emptyStore(userId);
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyStore(userId);
    const parsed = JSON.parse(raw) as CollectionStore;
    if (!parsed || !Array.isArray(parsed.collections) || !Array.isArray(parsed.items)) {
      return emptyStore(userId);
    }
    return {
      collections: parsed.collections,
      items: parsed.items,
      active: parsed.active ?? emptyStore().active,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    };
  } catch {
    return emptyStore(userId);
  }
}

export function saveCollectionStore(userId: string, store: CollectionStore): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify({
        collections: store.collections,
        items: store.items,
        active: store.active,
        observations: store.observations.slice(-50),
      })
    );
  } catch {
    // quota / private mode
  }
}

export function detectContextFromStore(store: CollectionStore): CollectionDetectContext {
  const activeId = store.active.collectionId;
  const active = activeId
    ? store.collections.find((c) => c.id === activeId) ?? null
    : null;
  let msSinceLastActivity: number | null = null;
  if (store.active.lastInteractionAt) {
    const t = Date.parse(store.active.lastInteractionAt);
    if (Number.isFinite(t)) msSinceLastActivity = Date.now() - t;
  }
  return {
    activeCollectionId: activeId,
    activeCollectionTitle: active?.title ?? null,
    collections: store.collections,
    msSinceLastActivity,
  };
}

export function applyAndPersistCollectionIntent(
  userId: string,
  intent: CollectionIntent
): ApplyResult {
  const store = loadCollectionStore(userId);
  const result = applyCollectionIntent(store, userId || 'anon', intent);
  saveCollectionStore(userId, result.store);
  void pushCollectionStoreRemote(userId, result.store);
  return result;
}

export function listOpenCollections(userId: string): Collection[] {
  return loadCollectionStore(userId).collections.filter((c) => c.status === 'open');
}

/** Pull remote into local when remote is newer / local empty. */
export async function hydrateCollectionsFromRemote(userId: string): Promise<CollectionStore> {
  const local = loadCollectionStore(userId);
  const remote = await fetchCollectionStoreRemote(userId);
  if (!remote) return local;
  if (local.collections.length === 0 && remote.collections.length > 0) {
    saveCollectionStore(userId, remote);
    return remote;
  }
  const localMax = Math.max(
    0,
    ...local.collections.map((c) => Date.parse(c.lastActivityAt) || 0)
  );
  const remoteMax = Math.max(
    0,
    ...remote.collections.map((c) => Date.parse(c.lastActivityAt) || 0)
  );
  if (remoteMax > localMax) {
    saveCollectionStore(userId, remote);
    return remote;
  }
  return local;
}
