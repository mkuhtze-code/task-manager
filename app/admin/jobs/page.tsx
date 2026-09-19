'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import MetricGrid from '@/components/admin/MetricGrid';

type Snapshot = {
  privacyNote: string;
  jobs: { total: number; created30d: number; active30d: number };
};

export default function AdminJobsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Jobs surface — aggregate job containers. No job names, clients, or locations.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <MetricGrid
            cells={[
              { label: 'Total jobs', value: String(data.jobs.total) },
              { label: 'Created 30d', value: String(data.jobs.created30d) },
              {
                label: 'With task activity 30d',
                value: String(data.jobs.active30d),
                note: 'Jobs that had a task created in the last 30 days',
              },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
