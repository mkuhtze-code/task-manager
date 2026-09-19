'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import MetricGrid from '@/components/admin/MetricGrid';

type Snapshot = {
  privacyNote: string;
  patterns: {
    completedTasks: number;
    predictionsWithOutcomes: number;
    accuracyPercent: number | null;
    note: string;
  };
};

export default function AdminPatternsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Patterns are learned on-device from each user&apos;s history. Admin only sees system-level evidence.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <MetricGrid
            cells={[
              { label: 'Completed tasks (history)', value: String(data.patterns.completedTasks) },
              {
                label: 'Predictions with outcomes',
                value: String(data.patterns.predictionsWithOutcomes),
              },
              {
                label: 'Estimate accuracy',
                value:
                  data.patterns.accuracyPercent == null
                    ? '—'
                    : `${data.patterns.accuracyPercent}%`,
              },
            ]}
          />
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 16 }}>{data.patterns.note}</p>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 8 }}>{data.privacyNote}</p>
        </>
      )}
    </div>
  );
}
