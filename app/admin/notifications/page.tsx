'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import StatusList, { type StatusItem } from '@/components/admin/StatusList';

type Snapshot = {
  privacyNote: string;
  notifications: StatusItem[];
};

export default function AdminNotificationsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/system-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Push delivery configuration. Subscription endpoints and FCM tokens are never returned.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <StatusList items={data.notifications} />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
