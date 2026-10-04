/**
 * Flush pending offline ops when online.
 * Entity handlers registered per kind — tasks, collections, etc.
 */

import { listPendingOps, markOpDone, markOpFailed, markOpSyncing } from './queue';
import { isOnline } from './network';
import type { OfflineEntityKind, SyncOp } from './types';
import { readJson, writeJson } from './storage';

export type SyncOpHandler = (op: SyncOp) => Promise<void>;

const handlers = new Map<OfflineEntityKind, SyncOpHandler>();

const META_PREFIX = 'dokkit.offline.meta.v1:';

function metaKey(userId: string): string {
  return `${META_PREFIX}${userId || 'anon'}`;
}

export function registerSyncHandler(
  entity: OfflineEntityKind,
  handler: SyncOpHandler
): void {
  handlers.set(entity, handler);
}

export function getLastFlushMeta(userId: string): {
  lastFlushAt: string | null;
  lastError: string | null;
} {
  return readJson(metaKey(userId), { lastFlushAt: null, lastError: null });
}

function setMeta(
  userId: string,
  patch: { lastFlushAt?: string | null; lastError?: string | null }
): void {
  const cur = getLastFlushMeta(userId);
  writeJson(metaKey(userId), { ...cur, ...patch });
}

let flushing = false;

export async function flushSyncQueue(userId: string): Promise<{
  flushed: number;
  failed: number;
}> {
  if (!isOnline()) {
    return { flushed: 0, failed: 0 };
  }
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  try {
    const pending = listPendingOps(userId);
    for (const op of pending) {
      const handler = handlers.get(op.entity);
      if (!handler) continue;
      markOpSyncing(userId, op.id);
      try {
        await handler(op);
        markOpDone(userId, op.id);
        flushed += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        markOpFailed(userId, op.id, msg);
        failed += 1;
        setMeta(userId, { lastError: msg });
      }
    }
    if (flushed > 0) {
      setMeta(userId, {
        lastFlushAt: new Date().toISOString(),
        lastError: failed > 0 ? getLastFlushMeta(userId).lastError : null,
      });
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

export function startSyncOnReconnect(userId: string): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const run = () => {
    void flushSyncQueue(userId);
  };
  window.addEventListener('online', run);
  run();
  return () => window.removeEventListener('online', run);
}
