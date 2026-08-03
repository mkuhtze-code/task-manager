'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

type WaitlistRow = {
  id: string;
  name: string;
  email: string;
  marketing_opt_in: boolean;
  created_at: string;
  approved_at: string | null;
};

export default function WaitlistInbox() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [items, setItems] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [approveError, setApproveError] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (session) checkAdminAndLoad();
  }, [session]);

  async function checkAdminAndLoad() {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const admin = !!adminRow;
    setIsAdmin(admin);

    if (admin) {
      const { data } = await supabase
        .from('waitlist_signups')
        .select('*')
        .order('created_at', { ascending: false });
      setItems(data || []);
    }
    setLoading(false);
  }

  async function approve(item: WaitlistRow) {
    setApproving((prev) => ({ ...prev, [item.id]: true }));
    setApproveError((prev) => ({ ...prev, [item.id]: '' }));

    const res = await fetch('/api/admin/approve-waitlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: item.id, email: item.email }),
    });
    const data = await res.json();

    setApproving((prev) => ({ ...prev, [item.id]: false }));

    if (!res.ok) {
      setApproveError((prev) => ({ ...prev, [item.id]: data.error || 'Could not approve.' }));
      return;
    }

    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, approved_at: data.approvedAt } : i)));
  }

  function exportCsv() {
    const rows = [
      ['name', 'email', 'marketing_opt_in', 'approved_at', 'created_at'],
      ...items.map((i) => [i.name, i.email, String(i.marketing_opt_in), i.approved_at || '', i.created_at]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dokkit-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Waitlist" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  if (loading || isAdmin === null) {
    return (
      <div className="app-shell">
        <AppHeader title="Waitlist" backHref="/" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app-shell">
        <AppHeader title="Waitlist" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>You don't have access to this page.</p>
      </div>
    );
  }

  const optInCount = items.filter((i) => i.marketing_opt_in).length;
  const approvedCount = items.filter((i) => i.approved_at).length;

  return (
    <div className="app-shell">
      <AppHeader title="Waitlist" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">
          {items.length} {items.length === 1 ? 'request' : 'requests'} · {approvedCount} approved · {optInCount} opted in to updates
        </div>
        {items.length > 0 && <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>}
        {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing yet.</p>}
      </div>

      {items.map((item) => (
        <div key={item.id} className="settings-panel feedback-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</div>
              <div className="account-email mono" style={{ fontSize: 13 }}>{item.email}</div>
            </div>
            {item.marketing_opt_in && <span className="tag tag-due" style={{ flexShrink: 0 }}>wants updates</span>}
          </div>

          <div className="feedback-meta">
            <span>
              {new Date(item.created_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>

          {approveError[item.id] && (
            <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{approveError[item.id]}</p>
          )}

          {item.approved_at ? (
            <div className="settings-row" style={{ gap: 6 }}>
              <span className="tag" style={{ background: 'var(--moss-bg)', color: '#1f8a3e' }}>✓ Approved</span>
              <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                {new Date(item.approved_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ) : (
            <button className="btn btn-steel" style={{ minHeight: 36 }} onClick={() => approve(item)} disabled={approving[item.id]}>
              {approving[item.id] ? 'Approving…' : 'Approve access'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
