
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

export default function ChangePassword() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [hasPassword, setHasPassword] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        const providers: string[] =
          (data.session.user.app_metadata?.providers as string[] | undefined) ||
          (data.session.user.identities || []).map((i: any) => i.provider);
        setHasPassword(providers.includes('email'));
      }
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!newPassword) {
      setError('New password is required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    if (hasPassword) {
      if (!currentPassword) {
        setError('Current password is required');
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (signInError) {
        setError('Current password is incorrect');
        setLoading(false);
        return;
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setMessage(
      hasPassword ? 'Password updated.' : 'Password set — you can now sign in with email and password too.'
    );
    setHasPassword(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLoading(false);

    setTimeout(() => router.push('/account'), 1100);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Change Password" backHref="/account" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title={hasPassword ? 'Change Password' : 'Set a Password'} backHref="/account" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        {!hasPassword && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
            You signed up with Google, so there's no password on this account yet. Set one below if
            you'd also like to be able to sign in with email and password.
          </p>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {hasPassword && (
            <div>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 'var(--space-1)' }}>
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                style={inputStyle}
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 'var(--space-1)' }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              style={inputStyle}
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
              style={inputStyle}
              disabled={loading}
            />
          </div>

          {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
          {message && <p style={{ color: 'var(--moss)', fontSize: 12, margin: 0 }}>{message}</p>}

          <button type="submit" className="btn btn-steel" disabled={loading}>
            {loading ? 'Saving…' : hasPassword ? 'Update Password' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
