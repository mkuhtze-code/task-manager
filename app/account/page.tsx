'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: 14,
  background: 'var(--paper)',
  boxSizing: 'border-box',
};

export default function Account() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function exportData() {
    if (!session) return;
    setExporting(true);
    setExportError('');
    try {
      const userId = session.user.id;

      const [tasksRes, subtasksRes, meetingsRes, settingsRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('user_id', userId),
        supabase.from('subtasks').select('*').eq('user_id', userId),
        supabase.from('meetings').select('*').eq('user_id', userId),
        supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      ]);

      const exportBundle = {
        exported_at: new Date().toISOString(),
        account_email: session.user.email,
        tasks: tasksRes.data || [],
        subtasks: subtasksRes.data || [],
        meetings: meetingsRes.data || [],
        settings: settingsRes.data || null,
      };

      const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dokkit-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError('Could not export data: ' + (e?.message || 'unknown error'));
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    setDeleteError('');

    const res = await fetch('/api/account/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.user.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      setDeleteError(data.error || 'Could not delete account.');
      setDeleting(false);
      return;
    }

    await supabase.auth.signOut();
    router.push('/');
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Account" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  const providers: string[] =
    (session.user.app_metadata?.providers as string[] | undefined) ||
    (session.user.identities || []).map((i: any) => i.provider);
  const hasPassword = providers.includes('email');
  const signInMethod = providers.includes('google') ? 'Google' : 'Email & password';
  const memberSince = session.user.created_at
    ? new Date(session.user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="app-shell">
      <AppHeader title="Account" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Account Information</div>
        <div className="account-email mono">{session.user.email}</div>
        <div className="account-detail-row">
          Signed in with {signInMethod}
          {memberSince && <span> · Member since {memberSince}</span>}
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Security</div>
        <Link
          href="/account/change-password"
          className="btn btn-ghost"
          style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
        >
          {hasPassword ? 'Change password' : 'Set a password'}
        </Link>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Your Data</div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
          Download everything Dokkit has stored for you — tasks, sub-tasks, meetings, and preferences —
          as a single file you keep.
        </p>
        {exportError && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{exportError}</p>}
        <button className="btn btn-ghost" onClick={exportData} disabled={exporting}>
          {exporting ? 'Preparing export…' : 'Export my data'}
        </button>
      </div>

      <div className="settings-panel danger-zone">
        <div className="settings-panel-title" style={{ color: 'var(--hazard)' }}>Danger Zone</div>

        {!deleteOpen ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
              Permanently delete your account and everything in it. This can't be undone.
            </p>
            <button className="btn btn-ghost danger-btn" onClick={() => setDeleteOpen(true)}>
              Delete account
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
              This permanently deletes your account, all tasks, sub-tasks, meetings, and preferences.
              Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              style={inputStyle}
              disabled={deleting}
            />
            {deleteError && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{deleteError}</p>}
            <div className="capture-row">
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmText('');
                  setDeleteError('');
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn danger-btn-solid"
                style={{ flex: 1 }}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </>
        )}
      </div>

      <button className="btn btn-ghost account-logout-btn" onClick={handleLogOut}>
        Log out
      </button>
    </div>
  );
}
