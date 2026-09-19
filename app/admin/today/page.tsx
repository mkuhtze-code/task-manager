'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import MetricGrid from '@/components/admin/MetricGrid';

type Snapshot = {
  generatedAt: string;
  privacyNote: string;
  today: {
    open: number;
    dueToday: number;
    completed24h: number;
    completed7d: number;
    created30d: number;
    total: number;
    doneTotal: number;
  };
};

export default function AdminTodayPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Today surface — system-wide task activity. Counts only; no task text.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <MetricGrid
            cells={[
              { label: 'Due today', value: String(data.today.dueToday) },
              { label: 'Open tasks', value: String(data.today.open) },
              { label: 'Completed 24h', value: String(data.today.completed24h) },
              { label: 'Completed 7d', value: String(data.today.completed7d) },
              { label: 'Created 30d', value: String(data.today.created30d) },
              { label: 'All-time tasks', value: String(data.today.total) },
              { label: 'All-time done', value: String(data.today.doneTotal) },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
