import { pendingCount } from './queue';
import { isOnline } from './network';
import { getLastFlushMeta } from './syncWorker';
import type { OfflineSyncSnapshot } from './types';

export function getOfflineSnapshot(userId: string): OfflineSyncSnapshot {
  const pending = pendingCount(userId);
  const meta = getLastFlushMeta(userId);
  return {
    pendingCount: pending,
    failedCount: 0,
    lastFlushAt: meta.lastFlushAt,
    lastError: meta.lastError,
    isOnline: isOnline(),
  };
}

export function offlineStatusLabel(snap: OfflineSyncSnapshot): string | null {
  if (!snap.isOnline && snap.pendingCount > 0) {
    return `Offline · ${snap.pendingCount} change${snap.pendingCount === 1 ? '' : 's'} on device`;
  }
  if (!snap.isOnline) return 'Offline · working on device';
  if (snap.pendingCount > 0) {
    return `Syncing ${snap.pendingCount} change${snap.pendingCount === 1 ? '' : 's'}…`;
  }
  return null;
}
