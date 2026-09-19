'use client';

import { useAdminSession } from '../AdminContext';
import { useAdminFetch } from '@/lib/admin/useAdminFetch';
import type { SystemState } from '@/lib/admin/types';

type Snapshot = {
  privacyNote: string;
  database: { state: SystemState; detail: string; notes: string[] };
};

export default function AdminDatabasePage() {
  const { session } = useAdminSession();
  const { data, loading, error } = useAdminFetch<Snapshot>('/api/admin/system-snapshot', session?.access_token);

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Database is reachable for Admin aggregates. No raw table browser or SQL console is provided.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {data && (
        <div className="settings-panel" style={{ margin: 0 }}>
          <strong style={{ fontSize: 13 }}>Postgres</strong>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}>{data.database.detail}</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
            {data.database.notes.map((n) => (
              <li key={n} style={{ marginBottom: 4 }}>
                {n}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 12 }}>{data.privacyNote}</p>
        </div>
      )}
    </div>
  );
}
