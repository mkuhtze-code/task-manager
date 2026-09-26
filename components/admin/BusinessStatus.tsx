'use client';

import Link from 'next/link';
import { useAdminSession } from '@/app/admin/AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { BusinessMetrics } from '@/lib/admin/businessMetrics';
import AdminPanel from './AdminPanel';
import StatusIndicator from './StatusIndicator';

export default function BusinessStatus() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<BusinessMetrics>(
    '/api/admin/business',
    session?.access_token
  );

  return (
    <AdminPanel
      title="Business"
      subtitle="Payments and subscriptions"
      action={
        <Link href="/admin/revenue" className="adm-action-link">
          Revenue →
        </Link>
      }
    >
      {loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Loading…</p>
      )}
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>
      )}
      {data && (
        <div className="adm-business">
          <div className="adm-business-row">
            <span className="adm-business-name">Stripe</span>
            <StatusIndicator state={data.stripe.state} compact />
          </div>
          <p className="adm-business-detail">{data.stripe.detail}</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginTop: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Est. MRR</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {data.estimatedMrrDisplay ?? '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Active subs</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {data.subscriptions.active}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Past due</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {data.failedPaymentsSignal}
              </div>
            </div>
          </div>
          {data.attention.length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
              {data.attention.map((a) => (
                <li key={a.title}>
                  <Link href={a.href}>{a.title}</Link> — {a.detail}
                </li>
              ))}
            </ul>
          )}
          <div className="adm-chip-row" style={{ marginTop: 12 }}>
            <Link href="/admin/subscriptions" className="adm-chip">
              Subscriptions
            </Link>
            <Link href="/admin/stripe" className="adm-chip">
              Stripe
            </Link>
            <Link href="/admin/trials" className="adm-chip">
              Trials
            </Link>
          </div>
        </div>
      )}
    </AdminPanel>
  );
}
