/**
 * Last-known entity snapshots for offline read.
 * Written after successful remote fetch; read when offline or remote fails.
 */

import { readJson, writeJson } from './storage';
import type { OfflineEntityKind } from './types';

const CACHE_PREFIX = 'dokkit.offline.cache.v1:';

type CacheEnvelope<T> = {
  updatedAt: string;
  items: T[];
};

function cacheKey(userId: string, kind: OfflineEntityKind): string {
  return `${CACHE_PREFIX}${userId || 'anon'}:${kind}`;
}

export function setEntityCache<T>(
  userId: string,
  kind: OfflineEntityKind,
  items: T[]
): void {
  const env: CacheEnvelope<T> = {
    updatedAt: new Date().toISOString(),
    items,
  };
  writeJson(cacheKey(userId, kind), env);
}

export function getEntityCache<T>(
  userId: string,
  kind: OfflineEntityKind
): { items: T[]; updatedAt: string | null } {
  const env = readJson<CacheEnvelope<T> | null>(cacheKey(userId, kind), null);
  if (!env || !Array.isArray(env.items)) {
    return { items: [], updatedAt: null };
  }
  return { items: env.items, updatedAt: env.updatedAt ?? null };
}

export function upsertEntityInCache<T extends { id: string }>(
  userId: string,
  kind: OfflineEntityKind,
  entity: T
): void {
  const { items } = getEntityCache<T>(userId, kind);
  const idx = items.findIndex((x) => x.id === entity.id);
  if (idx >= 0) items[idx] = entity;
  else items.push(entity);
  setEntityCache(userId, kind, items);
}

export function removeEntityFromCache(
  userId: string,
  kind: OfflineEntityKind,
  entityId: string
): void {
  const { items } = getEntityCache<{ id: string }>(userId, kind);
  setEntityCache(
    userId,
    kind,
    items.filter((x) => x.id !== entityId)
  );
}

export function patchEntityInCache<T extends { id: string }>(
  userId: string,
  kind: OfflineEntityKind,
  entityId: string,
  patch: Partial<T>
): T | null {
  const { items } = getEntityCache<T>(userId, kind);
  const idx = items.findIndex((x) => x.id === entityId);
  if (idx < 0) return null;
  const next = { ...items[idx], ...patch };
  items[idx] = next;
  setEntityCache(userId, kind, items);
  return next;
}
