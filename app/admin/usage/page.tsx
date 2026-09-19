'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import MetricGrid from '@/components/admin/MetricGrid';

type Snapshot = {
  privacyNote: string;
  activeUsers7d: number;
  surfaces: { today: number; jobs: number; travel: number };
  today: { completed7d: number; created30d: number };
  jobs: { total: number; active30d: number };
  meetings: { thisWeek: number; created30d: number };
  travel: { tripsActive: number; trips30d: number };
};

export default function AdminUsagePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Cross-product usage — active users and surface activity. No per-user breakdowns.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <MetricGrid
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
    </div>
  );
}
