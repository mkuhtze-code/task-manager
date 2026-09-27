
'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AppHeader from '@/components/AppHeader';

type Reply = {
  id: string;
  feedback_id: string;
  author_type: 'user' | 'admin';
  author_id: string | null;
  message: string;
  created_at: string;
};

type ContactItem = {
  id: string;
  message: string;
  page_context: string | null;
  created_at: string;
  user_last_read_at: string | null;
};

function hasUnreadAdminReply(item: ContactItem, replies: Reply[]): boolean {
  const lastRead = item.user_last_read_at
    ? new Date(item.user_last_read_at).getTime()
    : 0;
  return replies.some(
    (r) =>
      r.author_type === 'admin' && new Date(r.created_at).getTime() > lastRead
  );
}

export default function ContactPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof supabase.auth.getSession>
  >['data']['session']>(null);
  const [fromPage, setFromPage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('General');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const [threads, setThreads] = useState<ContactItem[]>([]);
  const [repliesById, setRepliesById] = useState<Record<string, Reply[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.email) setEmail(data.session.user.email);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setFromPage(params.get('from'));
  }, []);

  useEffect(() => {
    if (session) loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function loadThreads() {
    if (!session) return;
    const { data: items } = await supabase
      .from('feedback')
      .select('id, message, page_context, created_at, user_last_read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    setThreads(items || []);

    if (items && items.length > 0) {
      const ids = items.map((i) => i.id);
      const { data: replies } = await supabase
        .from('feedback_replies')
        .select('*')
        .in('feedback_id', ids)
        .order('created_at', { ascending: true });

      const grouped: Record<string, Reply[]> = {};
      for (const r of replies || []) {
        if (!grouped[r.feedback_id]) grouped[r.feedback_id] = [];
        grouped[r.feedback_id].push(r as Reply);
      }
      setRepliesById(grouped);
    }
  }

  async function openThread(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    const item = threads.find((f) => f.id === id);
    const replies = repliesById[id] || [];
    if (!item || !session) return;
    if (hasUnreadAdminReply(item, replies)) {
      const now = new Date().toISOString();
      await supabase
        .from('feedback')
        .update({ user_last_read_at: now })
        .eq('id', id);
      setThreads((prev) =>
        prev.map((f) => (f.id === id ? { ...f, user_last_read_at: now } : f))
      );
    }
  }

  async function sendReply(feedbackId: string) {
    const text = (replyDraft[feedbackId] || '').trim();
    if (!text || !session) return;
    setReplySending((prev) => ({ ...prev, [feedbackId]: true }));
    const { data, error: replyError } = await supabase
      .from('feedback_replies')
      .insert({
        feedback_id: feedbackId,
        author_type: 'user',
        author_id: session.user.id,
        message: text,
      })
      .select('*')
      .single();
    setReplySending((prev) => ({ ...prev, [feedbackId]: false }));
    if (replyError || !data) return;
    setRepliesById((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] || []), data as Reply],
    }));
    setReplyDraft((prev) => ({ ...prev, [feedbackId]: '' }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      setError('Please write a short message.');
      return;
    }
    if (!session && !anonymous && !email.includes('@')) {
      setError('Add an email so we can reply, or submit anonymously.');
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: trimmed,
          subject,
          name: name || undefined,
          email: email || undefined,
          anonymous,
          pageContext: fromPage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === 'string'
            ? data.error
            : 'Could not send. Email support@dokkit.space.'
        );
        setLoading(false);
        return;
      }
      setSent(true);
      setMessage('');
      if (session && !anonymous) loadThreads();
      setTimeout(() => setSent(false), 4000);
    } catch {
      setError('Could not send. Email support@dokkit.space.');
    }
    setLoading(false);
  }

  return (
    <div className="app-shell">
      <AppHeader title="Contact us" backHref="/" />

      <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
        <div className="settings-panel-title">Contact Dokkit</div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-soft)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Questions, billing help, or something that isn’t working — write here
          and we’ll get back to you. You can also email{' '}
          <a href="mailto:support@dokkit.space">support@dokkit.space</a>.
        </p>

        {sent ? (
          <p className="auth-sent" style={{ marginTop: 16 }}>
            Message sent. We’ll reply by email when we can.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginTop: 16,
            }}
          >
            <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              Topic
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={loading}
                style={{ display: 'block', width: '100%', marginTop: 6 }}
              >
                <option value="General">General</option>
                <option value="Billing">Billing</option>
                <option value="Technical">Something isn’t working</option>
                <option value="Account">Account</option>
                <option value="Other">Other</option>
              </select>
            </label>

            {!session && (
              <>
                <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Name (optional)
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading || anonymous}
                    style={{ display: 'block', width: '100%', marginTop: 6 }}
                  />
                </label>
                <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Email {!anonymous ? '(so we can reply)' : ''}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading || anonymous}
                    style={{ display: 'block', width: '100%', marginTop: 6 }}
                  />
                </label>
              </>
            )}

            <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={5}
                className="feedback-textarea"
                disabled={loading}
                style={{ display: 'block', width: '100%', marginTop: 6 }}
              />
            </label>

            <label className="feedback-anon-row">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                disabled={loading}
              />
              <span>Send anonymously (we may not be able to reply)</span>
            </label>

            {error ? (
              <p style={{ color: 'var(--hazard)', fontSize: 13 }}>{error}</p>
            ) : null}

            <button type="submit" className="btn btn-steel" disabled={loading}>
              {loading ? 'Sending…' : 'Send message'}
            </button>
          </form>
        )}
      </div>

      {session && threads.length > 0 && (
        <div className="settings-panel" style={{ marginTop: 'var(--space-5)' }}>
          <div className="settings-panel-title">Your messages</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {threads.map((item) => {
              const replies = repliesById[item.id] || [];
              const unread = hasUnreadAdminReply(item, replies);
              const open = expandedId === item.id;
              return (
                <li
                  key={item.id}
                  style={{
                    borderTop: '1px solid var(--line)',
                    padding: '12px 0',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openThread(item.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'block',
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: unread ? 600 : 400 }}>
                      {item.message.slice(0, 120)}
                      {item.message.length > 120 ? '…' : ''}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        color: 'var(--ink-soft)',
                        marginTop: 4,
                      }}
                    >
                      {new Date(item.created_at).toLocaleString()}
                      {unread ? ' · Reply' : ''}
                    </span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 12 }}>
                      {replies.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            fontSize: 13,
                            marginBottom: 8,
                            padding: 8,
                            background: 'var(--paper)',
                            borderRadius: 8,
                          }}
                        >
                          <strong>
                            {r.author_type === 'admin' ? 'Dokkit' : 'You'}
                          </strong>
                          <p style={{ margin: '4px 0 0' }}>{r.message}</p>
                        </div>
                      ))}
                      <textarea
                        value={replyDraft[item.id] || ''}
                        onChange={(e) =>
                          setReplyDraft((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Write a reply…"
                        className="feedback-textarea"
                        style={{ width: '100%', marginTop: 8 }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ marginTop: 8 }}
                        disabled={replySending[item.id]}
                        onClick={() => sendReply(item.id)}
                      >
                        {replySending[item.id] ? 'Sending…' : 'Reply'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!session && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-soft)',
            marginTop: 20,
            padding: '0 4px',
          }}
        >
          <button
            type="button"
            className="text-link"
            style={{ all: 'unset', cursor: 'pointer', color: 'var(--steel)' }}
            onClick={() => router.push('/')}
          >
            Sign in
          </button>{' '}
          to see past messages in the app.
        </p>
      )}
    </div>
  );
}
