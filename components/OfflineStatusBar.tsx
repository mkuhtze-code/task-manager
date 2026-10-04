'use client';

import { useOfflineStatus } from '@/hooks/useOfflineStatus';

/** Calm offline / pending-sync line. Renders nothing when fully online + synced. */
export function OfflineStatusBar({ userId }: { userId: string | null }) {
  const { label, isOnline } = useOfflineStatus(userId);
  if (!label) return null;
  return (
    <div
      className={isOnline ? 'offline-status-bar syncing' : 'offline-status-bar offline'}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
