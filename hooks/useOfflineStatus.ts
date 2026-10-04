'use client';

import { useEffect, useState } from 'react';
import {
  getOfflineSnapshot,
  offlineStatusLabel,
  subscribeOnline,
  flushSyncQueue,
  type OfflineSyncSnapshot,
} from '@/lib/offline';

export function useOfflineStatus(userId: string | null | undefined) {
  const [snap, setSnap] = useState<OfflineSyncSnapshot>(() =>
    getOfflineSnapshot(userId || 'anon')
  );

  useEffect(() => {
    const uid = userId || 'anon';
    const refresh = () => setSnap(getOfflineSnapshot(uid));
    refresh();
    const unsub = subscribeOnline(() => {
      refresh();
      if (userId) void flushSyncQueue(userId).then(refresh);
    });
    const t = setInterval(refresh, 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [userId]);

  return {
    ...snap,
    label: offlineStatusLabel(snap),
  };
}
