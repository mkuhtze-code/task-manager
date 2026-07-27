
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

export default function Feedback() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [fromPage, setFromPage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setFromPage(params.get('from'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      setError('Say a little about what you noticed first.');
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from('feedback').insert({
      user_id: anonymous ? null : session.user.id,
      submitter_email: anonymous ? null : session.user.email,
      message: trimmed,
      is_anonymous: anonymous,
      page_context: fromPage,
    });
    setLoading(false);

    if (insertError) {
      setError('Could not send feedback: ' + insertError.message);
      return;
    }

    setSent(true);
    setMessage('');
    setTimeout(() => router.push('/'), 1400);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <AppHeader title="Feedback" backHref="/" />
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 20 }}>Sign in on the main page first.</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader title="Feedback" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Tell us what's not working (or what is)</div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
          This goes straight to the person building Dokkit — no survey, no waiting for a check-in.
          Bugs, confusing moments, ideas — anything.
        </p>

        {sent ? (
          <p className="auth-sent">Thanks — that's been sent.</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What happened, or what would help?"
              rows={5}
              className="feedback-textarea"
              disabled={loading}
            />

            <label className="feedback-anon-row">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                disabled={loading}
              />
              <span>Submit anonymously — your name and email won't be attached</span>
            </label>

            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

            <button type="submit" className="btn btn-steel" disabled={loading}>
              {loading ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
