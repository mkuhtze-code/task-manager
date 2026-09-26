'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import AdminPanel from '@/components/admin/AdminPanel';
import StatusIndicator from '@/components/admin/StatusIndicator';

export default function AdminStripePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<BusinessMetrics>(
    '/api/admin/business',
    session?.access_token
  );

  if (loading) return null;

  const stripe = data?.stripe;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16, maxWidth: 520 }}>
        Payment infrastructure posture. Secrets remain in environment variables — Admin never
        displays API keys, webhook secrets, or card data (SOC 2 / ISO 27001).
      </p>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }} role="alert">
          {error}
        </p>
      )}
      {stripe && (
        <AdminPanel title="Stripe connection" subtitle="Configuration only">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <StatusIndicator state={stripe.state} compact />
            <strong style={{ fontSize: 13 }}>
              {stripe.configured ? 'Configured' : 'Not configured'}
            </strong>
            {stripe.configured && (
              <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                {stripe.mode} mode
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>{stripe.detail}</p>
          <ul
            style={{
              margin: '16px 0 0',
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--ink-soft)',
              lineHeight: 1.55,
            }}
          >
            <li>Checkout and Customer Portal run in the app via server routes.</li>
            <li>Webhooks update account_tier and billing_subscriptions.</li>
            <li>
              Operational billing actions for a single customer belong in the{' '}
              <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer">
                Stripe Dashboard
              </a>
              .
            </li>
          </ul>
        </AdminPanel>
      )}
      {data && data.billingEvents7d > 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 16 }}>
          {data.billingEvents7d} billing event(s) recorded in the last 7 days (webhook intake).
        </p>
      )}
    </div>
  );
}
