'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '../AdminContext';
import { apiUrl } from '@/lib/authedFetch';

type AdminRow = {
  userId: string;
  email: string | null;
  adminSince: string;
  accountCreatedAt: string | null;
  isYou: boolean;
};

export default function AdminAccessPage() {
  const { session } = useAdminSession();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [session]);

  async function load() {
    setLoading(true);
    setError('');
    const response = await fetch(apiUrl('/api/admin/admin-access'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || 'Could not load administrators.');
      setLoading(false);
      return;
    }
    setAdmins(payload.admins || []);
    setNote(payload.note || '');
    setLoading(false);
  }

  if (loading) return null;

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 12 }}>
        Who can open Admin. Grant and revoke are not available in the app — that keeps privilege changes out of a normal admin session.
      </p>
      {note && (
        <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginBottom: 12 }}>{note}</p>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {admins.length === 0 && !error && (
          <div className="settings-panel" style={{ margin: 0 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>No administrators found.</p>
          </div>
        )}
        {admins.map((admin) => (
          <div
            key={admin.userId}
            className="settings-panel"
            style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>
                {admin.email || admin.userId}
                {admin.isYou ? ' · you' : ''}
              </strong>
              <div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>
                Admin since{' '}
                {new Date(admin.adminSince).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {admin.accountCreatedAt && (
                  <>
                    {' · '}account{' '}
                    {new Date(admin.accountCreatedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </>
                )}
              </div>
              <div style={{ color: 'var(--ink-faint)', fontSize: 10, fontFamily: 'monospace' }}>
                {admin.userId}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-panel" style={{ marginTop: 16 }}>
        <div className="settings-panel-title">Grant or revoke (SQL)</div>
        <pre
          style={{
            fontSize: 11,
            overflow: 'auto',
            margin: '8px 0 0',
            padding: 12,
            background: 'var(--surface-2, rgba(0,0,0,0.04))',
            borderRadius: 8,
          }}
        >{`-- Grant
insert into public.admins (user_id)
values ('<auth.users.id>');

-- Revoke
delete from public.admins
where user_id = '<auth.users.id>';`}</pre>
      </div>
    </div>
  );
}
