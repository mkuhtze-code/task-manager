'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius-sm)',
  padding: '12px',
  fontSize: 15,
  background: 'var(--paper)',
  boxSizing: 'border-box',
};

export default function ResetPassword() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function handleRecoveryLink() {
      // Supabase's client auto-detects the older hash-based recovery link
      // format, but the newer ?code= (PKCE) format needs an explicit
      // exchange — same failure mode that broke Google sign-in elsewhere
      // in this app, so hardening this page against it too.
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Recovery code exchange error:', error);
        }
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    handleRecoveryLink();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    return () => listener.subscription.unsubscribe();
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
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('Password updated — taking you to sign in…');
    setTimeout(() => router.push('/'), 1200);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">Dokkit</div>
        <h1 className="auth-title">Reset your password</h1>

        {checking ? (
          <p className="auth-sub">Checking your reset link…</p>
        ) : !ready ? (
          <>
            <p className="auth-sub">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <button className="btn btn-ghost" onClick={() => router.push('/')}>
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              style={inputStyle}
              disabled={loading}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              style={inputStyle}
              disabled={loading}
            />
            {error && <p className="auth-error">{error}</p>}
            {message && <p className="auth-sent">{message}</p>}
            <button type="submit" className="btn btn-steel" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
