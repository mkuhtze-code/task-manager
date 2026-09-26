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
        Subscription lifecycle as stored in Dokkit after Stripe webhooks. Payment methods and
        invoices are not listed here — use Stripe for individual customer billing actions.
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
            <AdminMetric metric={m('active', 'Active', String(s.active))} />
            <AdminMetric metric={m('trialing', 'Trialing', String(s.trialing))} />
            <AdminMetric metric={m('past_due', 'Past due', String(s.past_due))} />
            <AdminMetric metric={m('canceled', 'Canceled', String(s.canceled))} />
            <AdminMetric metric={m('unpaid', 'Unpaid', String(s.unpaid))} />
            <AdminMetric metric={m('incomplete', 'Incomplete', String(s.incomplete))} />
            <AdminMetric metric={m('total', 'Total rows', String(s.total))} />
          </div>
          <AdminPanel title="Account tiers" subtitle="user_settings (entitlement source)">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
              }}
            >
              <AdminMetric metric={m('free', 'Free', String(data?.tiers.free ?? 0))} />
              <AdminMetric metric={m('premium', 'Premium', String(data?.tiers.premium ?? 0))} />
              <AdminMetric
                metric={m('tt', 'Trusted tester', String(data?.tiers.trusted_tester ?? 0))}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 12, marginBottom: 0 }}>
              Entitlements follow account_tier and billing_status. Admin tier overrides should stay
              consistent with Stripe when a paid subscription exists.
            </p>
          </AdminPanel>
        </>
      )}
    </div>
  );
}
