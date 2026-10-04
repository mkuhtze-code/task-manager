/**
 * App-wide offline foundation.
 * Local is source of truth while working; cloud is sync.
 */

export type OfflineEntityKind =
  | 'task'
  | 'job'
  | 'meeting'
  | 'collection'
  | 'subtask'
  | 'settings';

export type SyncOpAction = 'upsert' | 'update' | 'delete';

export type SyncOpStatus = 'pending' | 'syncing' | 'done' | 'failed';

export type SyncOp = {
  id: string;
  clientOpId: string;
  userId: string;
  entity: OfflineEntityKind;
  action: SyncOpAction;
  /** Entity id when known (update/delete). */
  entityId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  status: SyncOpStatus;
};

export type OfflineSyncSnapshot = {
  pendingCount: number;
  failedCount: number;
  lastFlushAt: string | null;
  lastError: string | null;
  isOnline: boolean;
};

export function makeClientOpId(prefix = 'op'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeSyncOpId(): string {
  return makeClientOpId('sync');
}
