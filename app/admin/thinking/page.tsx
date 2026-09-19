'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import SimpleMetricGrid from '@/components/admin/SimpleMetricGrid';

type Snapshot = {
  privacyNote: string;
  thinking: {
    predictions: number;
    outcomes: number;
    accuracyPercent: number | null;
    averageRatio: number | null;
    medianRatio: number | null;
    accuracyClass: string;
  };
};

export default function AdminThinkingPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/product-snapshot', session?.access_token);

  if (loading) return null;

  const t = data?.thinking;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Thinking engine — estimate accuracy evidence. Aggregate ratios only; no per-task predictions.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {t && (
        <>
          <SimpleMetricGrid
            cells={[
              { label: 'Predictions logged', value: String(t.predictions) },
              { label: 'With outcomes', value: String(t.outcomes) },
              {
                label: 'Accuracy',
                value: t.accuracyPercent == null ? '—' : `${t.accuracyPercent}%`,
                note:
                  t.outcomes === 0
                    ? 'No completed predictions yet'
                    : `Tendency: ${t.accuracyClass}`,
              },
              {
                label: 'Avg ratio',
                value: t.averageRatio == null ? '—' : t.averageRatio.toFixed(2),
                note: 'actual ÷ estimate',
              },
              {
                label: 'Median ratio',
                value: t.medianRatio == null ? '—' : t.medianRatio.toFixed(2),
              },
            ]}
          />
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16 }}>{data!.privacyNote}</p>
        </>
      )}
    </div>
  );
}
