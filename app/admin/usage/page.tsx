'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import SimpleMetricGrid from '@/components/admin/SimpleMetricGrid';
import { formatStorageBytes } from '@/lib/storageQuota';

type Snapshot = {
  privacyNote: string;
  activeUsers7d: number;
  surfaces: { today: number; jobs: number; travel: number };
  today: { completed7d: number; created30d: number };
  jobs: { total: number; active30d: number };
  meetings: { thisWeek: number; created30d: number };
  travel: { tripsActive: number; trips30d: number };
};

type StorageSnapshot = {
  privacyNote: string;
  accounts: number;
  usersWithMedia: number;
  usersWarning: number;
  usersCritical: number;
  usersExceeded: number;
  totalUsedBytes: number;
  totalLimitBytes: number;
  mediaObjectCount: number;
  defaultLimitBytes: number;
  generatedAt: string;
};

export default function AdminUsagePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>(
    '/api/admin/product-snapshot',
    session?.access_token
  );
  const {
    data: storage,
    loading: storageLoading,
    error: storageError,
  } = useAdminFetch<StorageSnapshot>('/api/admin/storage-snapshot', session?.access_token);

  if (loading && storageLoading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Cross-product usage — active users and surface activity. No per-user breakdowns.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <SimpleMetricGrid
            cells={[
              {
                label: 'Active users (7d)',
                value: String(data.activeUsers7d),
                note: 'Task created or completed',
              },
              { label: 'Today surface events', value: String(data.surfaces.today) },
              { label: 'Jobs surface events', value: String(data.surfaces.jobs) },
              { label: 'Travel surface events', value: String(data.surfaces.travel) },
              { label: 'Tasks completed 7d', value: String(data.today.completed7d) },
              { label: 'Tasks created 30d', value: String(data.today.created30d) },
              { label: 'Jobs total', value: String(data.jobs.total) },
              { label: 'Jobs active 30d', value: String(data.jobs.active30d) },
              { label: 'Meetings this week', value: String(data.meetings.thisWeek) },
              { label: 'Trips active', value: String(data.travel.tripsActive) },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}

      <h2
        style={{
          fontSize: 14,
          fontWeight: 700,
          marginTop: 28,
          marginBottom: 8,
          color: 'var(--ink)',
        }}
      >
        Hosted file storage (system)
      </h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Aggregate Dokkit-hosted media only. No individual accounts or file contents.
      </p>
      {storageError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{storageError}</p>}
      {storage && (
        <>
          <SimpleMetricGrid
            cells={[
              {
                label: 'Total used',
                value: formatStorageBytes(storage.totalUsedBytes),
                note: 'Sum of account usage counters',
              },
              {
                label: 'Media objects',
                value: String(storage.mediaObjectCount),
                note: 'meeting_media rows',
              },
              {
                label: 'Accounts with media',
                value: String(storage.usersWithMedia),
              },
              {
                label: 'Default limit / account',
                value: formatStorageBytes(storage.defaultLimitBytes),
              },
              {
                label: 'Near limit (≥80%)',
                value: String(storage.usersWarning),
              },
              {
                label: 'Critical (≥95%)',
                value: String(storage.usersCritical),
              },
              {
                label: 'At or over limit',
                value: String(storage.usersExceeded),
              },
              {
                label: 'Accounts metered',
                value: String(storage.accounts),
              },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>
            {storage.privacyNote}
          </p>
        </>
      )}
    </div>
  );
}
