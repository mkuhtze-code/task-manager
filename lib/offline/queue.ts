/**
 * Persistent sync operation queue.
 * Idempotent via clientOpId — same op never applied twice upstream when used correctly.
 */

import { readJson, writeJson } from './storage';
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

function saveQueue(userId: string, ops: SyncOp[]): void {
  const pending = ops.filter(
    (o) => o.status === 'pending' || o.status === 'syncing' || o.status === 'failed'
  );
  const done = ops.filter((o) => o.status === 'done').slice(-50);
  writeJson(key(userId), [...pending, ...done].slice(-200));
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
    (o) => o.clientOpId === clientOpId && (o.status === 'pending' || o.status === 'done')
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
  saveQueue(userId, existing);
  return op;
}

export function listPendingOps(userId: string): SyncOp[] {
  return loadQueue(userId).filter((o) => o.status === 'pending' || o.status === 'failed');
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
