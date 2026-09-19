'use client';

import Link from 'next/link';
import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';

type OverviewLite = {
  feedback: { total: number; open: number; replied: number };
};

/** Support queue is Feedback until a separate support product exists. */
export default function AdminSupportPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<OverviewLite>('/api/admin/overview', session?.access_token);

  if (loading) return null;

  const fb = data?.feedback;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Support is handled through the Feedback inbox. Message content is only available on the Feedback page (admin API, audited).
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {fb && (
        <div className="settings-panel" style={{ margin: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{fb.total}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Awaiting reply</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{fb.open}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Replied</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{fb.replied}</div>
            </div>
          </div>
          <Link href="/admin/feedback" className="adm-action-link" style={{ display: 'inline-block', marginTop: 12 }}>
            Open Feedback inbox →
          </Link>
        </div>
      )}
    </div>
  );
}
