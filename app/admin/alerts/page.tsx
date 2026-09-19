'use client';

import Link from 'next/link';
import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { AttentionItem } from '@/lib/admin/types';

type OverviewLite = {
  overall: string;
  overallLabel: string;
  overallDetail: string;
  attention: AttentionItem[];
  generatedAt: string;
};

/**
 * Alerts are derived from Overview attention items — system signals only
 * (error counts, open feedback count, onboarding count). No user content.
 */
export default function AdminAlertsPage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<OverviewLite>('/api/admin/overview', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Live attention signals from the system. Threshold rules and notification routing are not configured yet — this is a read-only view of current issues.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <>
          <div className="settings-panel" style={{ margin: '0 0 12px' }}>
            <strong style={{ fontSize: 13 }}>{data.overallLabel}</strong>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{data.overallDetail}</p>
          </div>
          {data.attention.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No open alerts.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {data.attention.map((a, i) => (
                <div key={`${a.title}-${i}`} className="settings-panel" style={{ margin: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
                    {a.severity}
                  </div>
                  <strong style={{ fontSize: 13 }}>{a.title}</strong>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 8px' }}>{a.detail}</p>
                  {a.href && (
                    <Link href={a.href} className="adm-action-link" style={{ fontSize: 12 }}>
                      Open →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
