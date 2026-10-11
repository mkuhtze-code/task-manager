'use client';

import { useOfflineStatus } from '@/hooks/useOfflineStatus';

/** Calm offline / pending-sync line. Renders nothing when fully online + synced. */
export function OfflineStatusBar({ userId }: { userId: string | null }) {
  const { label, isOnline, failedCount, retrySync } = useOfflineStatus(userId);
  if (!label) return null;
  return (
    <div
      className={isOnline ? 'offline-status-bar syncing' : 'offline-status-bar offline'}
      role="status"
      aria-live="polite"
    >
      <span>{label}</span>
      {isOnline && failedCount > 0 && (
        <button type="button" onClick={retrySync} className="offline-status-retry">
          Retry sync
        </button>
      )}
    </div>
  );
}
