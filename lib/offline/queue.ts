/**
 * Persistent sync operation queue.
 * Idempotent via clientOpId — same op never applied twice upstream when used correctly.
 */

import { readJson } from './storage';
import type { OfflineEntityKind, SyncOp, SyncOpAction } from './types';
import { makeClientOpId, makeSyncOpId } from './types';

const QUEUE_PREFIX = 'dokkit.offline.queue.v1:';

function key(userId: string): string {
  return `${QUEUE_PREFIX}${userId || 'anon'}`;
}

export function loadQueue(userId: string): SyncOp[] {
  const list = readJson<SyncOp[]>(key(userId), []);
  return Array.isArray(list) ? list : [];
}

function saveQueue(userId: string, ops: SyncOp[]): boolean {
  // Never truncate unacknowledged work: silently dropping an offline mutation
  // is worse than retaining a longer queue. Bound only completed history.
  const pending = ops.filter(
    (o) => o.status === 'pending' || o.status === 'syncing' || o.status === 'failed'
  );
  const done = ops.filter((o) => o.status === 'done').slice(-50);
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key(userId), JSON.stringify([...pending, ...done]));
    return true;
  } catch {
    // Do not report an offline write as accepted if local storage rejected it.
    return false;
  }
}

export function enqueueOp(
  userId: string,
  input: {
    entity: OfflineEntityKind;
    action: SyncOpAction;
    payload: Record<string, unknown>;
    entityId?: string | null;
    clientOpId?: string;
  }
): SyncOp {
  const clientOpId = input.clientOpId || makeClientOpId(input.entity);
  const existing = loadQueue(userId);
  const prior = existing.find(
    (o) => o.clientOpId === clientOpId
  );
  if (prior) return prior;

  const op: SyncOp = {
    id: makeSyncOpId(),
    clientOpId,
    userId: userId || 'anon',
    entity: input.entity,
    action: input.action,
    entityId: input.entityId ?? null,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: 'pending',
  };
  existing.push(op);
  if (!saveQueue(userId, existing)) {
    throw new Error('Dokkit could not save this change locally. Check device storage and try again.');
  }
  if (!loadQueue(userId).some((saved) => saved.id === op.id)) {
    throw new Error('Dokkit could not confirm this change was saved locally. Try again.');
  }
  return op;
}

export function listPendingOps(userId: string): SyncOp[] {
  // A persisted 'syncing' op may be left behind by a closed tab or app crash.
  // Treat it as retryable; handlers must be idempotent for this reason.
  return loadQueue(userId).filter(
    (o) => o.status === 'pending' || o.status === 'failed' || o.status === 'syncing'
  );
}

export function markOpSyncing(userId: string, opId: string): void {
  const list = loadQueue(userId);
  const op = list.find((o) => o.id === opId);
  if (!op) return;
  op.status = 'syncing';
  op.attempts += 1;
  saveQueue(userId, list);
}

export function markOpDone(userId: string, opId: string): void {
  const list = loadQueue(userId);
  const op = list.find((o) => o.id === opId);
  if (!op) return;
  op.status = 'done';
  op.lastError = null;
  saveQueue(userId, list);
}

export function markOpFailed(userId: string, opId: string, error: string): void {
  const list = loadQueue(userId);
  const op = list.find((o) => o.id === opId);
  if (!op) return;
  op.status = 'failed';
  op.lastError = error.slice(0, 300);
  saveQueue(userId, list);
}

export function pendingCount(userId: string): number {
  return listPendingOps(userId).length;
}
