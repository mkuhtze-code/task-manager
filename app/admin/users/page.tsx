'use client';

import { useEffect, useState } from 'react';
import { useAdminSession } from '../AdminContext';

type User = { id: string; email: string | null; createdAt: string; status: 'active' | 'terminated' };

export default function AdminUsersPage() {
  const { session } = useAdminSession();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    const response = await fetch('/app/api/admin/account-status', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || 'Could not load users.'); return; }
    setUsers(payload.users || []);
  }

  useEffect(() => { load(); }, [session]);

  async function setStatus(user: User, status: User['status']) {
    if (status === 'terminated' && !window.confirm(`Terminate ${user.email || 'this user'}? They will be signed out and denied protected data.`)) return;
    setUpdating(user.id);
    setError('');
    const response = await fetch('/app/api/admin/account-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: user.id, status }),
    });
    const payload = await response.json();
    setUpdating(null);
    if (!response.ok) { setError(payload.error || 'Could not update this account.'); return; }
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status } : item));
  }

  return <div style={{ marginTop: 'var(--space-4)' }}>
    <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Terminated accounts are signed out and blocked server-side, including when an old session token is retained.</p>
    {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
    <div style={{ display: 'grid', gap: 8 }}>
      {users.map((user) => <div key={user.id} className="settings-panel" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 13 }}>{user.email || user.id}</strong><div style={{ color: 'var(--ink-faint)', fontSize: 11 }}>{user.status === 'active' ? 'Active' : 'Terminated'}</div></div>
        <button className={user.status === 'active' ? 'btn btn-ghost' : 'btn btn-steel'} style={{ minHeight: 34 }} disabled={updating === user.id} onClick={() => setStatus(user, user.status === 'active' ? 'terminated' : 'active')}>
          {updating === user.id ? 'Saving…' : user.status === 'active' ? 'Terminate' : 'Reactivate'}
        </button>
      </div>)}
    </div>
  </div>;
}
