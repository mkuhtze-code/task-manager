'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

export default function Account() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    // Validate passwords
    if (!currentPassword) {
      setError('Current password is required');
      setLoading(false);
      return;
    }

    if (!newPassword) {
      setError('New password is required');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // First verify current password by attempting to re-authenticate
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (signInError) {
      setError('Current password is incorrect');
      setLoading(false);
      return;
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setMessage('Password updated successfully!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLoading(false);

    // Clear message after 3 seconds
    setTimeout(() => setMessage(''), 3000);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Account" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Account" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Account Information</div>
        <div className="account-email mono">{session.user.email}</div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-title">Change Password</div>
        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 'var(--space-1)' }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              style={{
                width: '100%',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 14,
                background: 'var(--paper)',
                boxSizing: 'border-box',
              }}
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 'var(--space-1)' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={{
                width: '100%',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 14,
                background: 'var(--paper)',
                boxSizing: 'border-box',
              }}
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 'var(--space-1)' }}>
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={{
                width: '100%',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: 14,
                background: 'var(--paper)',
                boxSizing: 'border-box',
              }}
              disabled={loading}
            />
          </div>

          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          {message && <p style={{ color: 'var(--moss)', fontSize: 12, margin: 0 }}>{message}</p>}

          <button type="submit" className="btn btn-steel" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      <button className="btn btn-ghost account-logout-btn" onClick={handleLogOut}>
        Log out
      </button>
    </div>
  );
}
