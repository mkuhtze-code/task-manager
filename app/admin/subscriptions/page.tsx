'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import AdminPanel from '@/components/admin/AdminPanel';
import AdminMetric from '@/components/admin/AdminMetric';

export default function AdminSubscriptionsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<BusinessMetrics>(
    '/api/admin/business',
    session?.access_token
  );

  if (loading) return null;

  const s = data?.subscriptions;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16, maxWidth: 520 }}>
        Subscription lifecycle as stored in Dokkit after Stripe webhooks. No payment methods or
        invoices are listed here — use Stripe for individual customer billing actions.
      </p>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} role="alert">
          {error}
        </p>
      )}
      {s && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <AdminMetric label="Active" value={String(s.active)} />
            <AdminMetric label="Trialing" value={String(s.trialing)} />
            <AdminMetric label="Past due" value={String(s.past_due)} />
            <AdminMetric label="Canceled" value={String(s.canceled)} />
            <AdminMetric label="Unpaid" value={String(s.unpaid)} />
            <AdminMetric label="Incomplete" value={String(s.incomplete)} />
            <AdminMetric label="Total rows" value={String(s.total)} />
          </div>
          <AdminPanel title="Account tiers" subtitle="user_settings (entitlement source)">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
              }}
            >
              <AdminMetric label="Free" value={String(data?.tiers.free ?? 0)} />
              <AdminMetric label="Premium" value={String(data?.tiers.premium ?? 0)} />
              <AdminMetric
                label="Trusted tester"
                value={String(data?.tiers.trusted_tester ?? 0)}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 12, marginBottom: 0 }}>
              Entitlements follow account_tier and billing_status. Admin tier changes are support
              overrides — keep them consistent with Stripe where a paid sub exists.
            </p>
          </AdminPanel>
        </>
      )}
    </div>
  );
}
