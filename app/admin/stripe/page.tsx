'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { SystemState } from '@/lib/admin/types';

type Snapshot = {
  business: { stripe: { state: SystemState; detail: string } };
};

export default function AdminStripePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/system-snapshot', session?.access_token);

  if (loading) return null;

  const stripe = data?.business.stripe;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Payment infrastructure. No customer or card data is stored in Dokkit Admin.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {stripe && (
        <div className="settings-panel" style={{ margin: 0 }}>
          <strong style={{ fontSize: 13 }}>Stripe</strong>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>{stripe.detail}</p>
        </div>
      )}
    </div>
  );
}
