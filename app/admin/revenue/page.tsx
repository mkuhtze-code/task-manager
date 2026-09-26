'use client';

import Link from 'next/link';
import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import type { OverviewMetric } from '@/lib/admin/types';
import AdminPanel from '@/components/admin/AdminPanel';
import AdminMetric from '@/components/admin/AdminMetric';

function m(
  key: string,
  label: string,
  display: string,
  note?: string
): OverviewMetric {
  return { key, label, value: null, display, note };
}

export default function AdminRevenuePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<BusinessMetrics>(
    '/api/admin/business',
    session?.access_token
  );

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16, maxWidth: 520 }}>
        Revenue signals from Dokkit billing records and the configured Stripe price.
        Figures are operational estimates — not accounting statements. Card data is never stored here.
      </p>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <AdminMetric
              metric={m(
                'mrr',
                'Est. MRR',
                data.estimatedMrrDisplay ?? '—',
                data.estimatedMrrDisplay
                  ? 'Active + trialing × monthly price'
                  : 'Configure STRIPE_PRICE_MONTHLY to estimate'
              )}
            />
            <AdminMetric
              metric={m('active', 'Paying (active)', String(data.subscriptions.active))}
            />
            <AdminMetric
              metric={m('trialing', 'Trialing', String(data.subscriptions.trialing))}
            />
            <AdminMetric
              metric={m('premium', 'Premium accounts', String(data.tiers.premium))}
            />
          </div>
          <AdminPanel title="Notes" subtitle="Interpretation">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
              <li>
                MRR uses subscription counts in Dokkit and the unit amount of STRIPE_PRICE_MONTHLY —
                not Stripe Balance or payouts.
              </li>
              <li>
                Trusted testers ({data.tiers.trusted_tester}) have full access without a card and are
                excluded from MRR.
              </li>
              <li>
                Ledger detail lives in the{' '}
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                  Stripe Dashboard
                </a>
                .
              </li>
            </ul>
            <p style={{ marginTop: 12, fontSize: 13 }}>
              <Link href="/admin/subscriptions" className="adm-action-link">
                Subscriptions →
              </Link>
            </p>
          </AdminPanel>
        </>
      )}
    </div>
  );
}
