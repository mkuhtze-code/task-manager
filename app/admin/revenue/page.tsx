'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import AdminPanel from '@/components/admin/AdminPanel';
import AdminMetric from '@/components/admin/AdminMetric';
import Link from 'next/link';

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
        Figures are estimates for operations — not accounting statements. Card data is never stored here.
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
              label="Est. MRR"
              value={data.estimatedMrrDisplay ?? '—'}
              note={
                data.estimatedMrrDisplay
                  ? 'Active + trialing × monthly price'
                  : 'Configure STRIPE_PRICE_MONTHLY to estimate'
              }
            />
            <AdminMetric
              label="Paying (active)"
              value={String(data.subscriptions.active)}
            />
            <AdminMetric
              label="Trialing"
              value={String(data.subscriptions.trialing)}
            />
            <AdminMetric
              label="Premium accounts"
              value={String(data.tiers.premium)}
            />
          </div>
          <AdminPanel title="Notes" subtitle="Interpretation">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
              <li>
                MRR is derived from subscription counts in Dokkit and the unit amount of{' '}
                <code style={{ fontSize: 12 }}>STRIPE_PRICE_MONTHLY</code> — not from Stripe
                Balance or payouts.
              </li>
              <li>
                Trusted testers ({data.tiers.trusted_tester}) are full access without a card and
                are excluded from MRR.
              </li>
              <li>
                For ledger detail use the{' '}
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
