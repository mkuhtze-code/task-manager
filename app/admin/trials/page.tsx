'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import AdminPanel from '@/components/admin/AdminPanel';
import AdminMetric from '@/components/admin/AdminMetric';

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
        Trialing subscriptions as reported by Stripe webhooks into Dokkit. No separate trial
        product is required — Stripe trial periods appear as status <code>trialing</code>.
      </p>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} role="alert">
          {error}
        </p>
      )}
      {data && (
        <AdminPanel title="Trials" subtitle="Current">
          <AdminMetric label="Trialing now" value={String(data.subscriptions.trialing)} />
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 12, marginBottom: 0 }}>
            Conversion tracking (trial → active) can be added when trial periods are enabled on
            the Stripe price. Until then, treat trialing as a live subscription status only.
          </p>
        </AdminPanel>
      )}
    </div>
  );
}
