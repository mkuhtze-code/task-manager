'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import type { OverviewMetric } from '@/lib/admin/types';
import AdminPanel from '@/components/admin/AdminPanel';
import AdminMetric from '@/components/admin/AdminMetric';

function m(key: string, label: string, display: string): OverviewMetric {
  return { key, label, value: null, display };
}

export default function AdminTrialsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<BusinessMetrics>(
    '/api/admin/business',
    session?.access_token
  );

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16, maxWidth: 520 }}>
        Trialing subscriptions as reported by Stripe webhooks. Stripe trial periods appear as
        status trialing.
      </p>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} role="alert">
          {error}
        </p>
      )}
      {data && (
        <AdminPanel title="Trials" subtitle="Current">
          <AdminMetric
            metric={m('trialing', 'Trialing now', String(data.subscriptions.trialing))}
          />
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 12, marginBottom: 0 }}>
            Conversion rates (trial → active) can be tracked when trial periods are enabled on the
            Stripe price.
          </p>
        </AdminPanel>
      )}
    </div>
  );
}
