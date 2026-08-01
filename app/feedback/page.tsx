'use client';

import { useEffect, useState } from 'react';
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

type FeedbackItem = {
  id: string;
  message: string;
  page_context: string | null;
  created_at: string;
  user_last_read_at: string | null;
};

function hasUnreadAdminReply(item: FeedbackItem, replies: Reply[]): boolean {
  const lastRead = item.user_last_read_at ? new Date(item.user_last_read_at).getTime() : 0;
  return replies.some((r) => r.author_type === 'admin' && new Date(r.created_at).getTime() > lastRead);
}

export default function Feedback() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [fromPage, setFromPage] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([]);
  const [repliesByFeedback, setRepliesByFeedback] = useState<Record<string, Reply[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setFromPage(params.get('from'));
  }, []);

  useEffect(() => {
    if (session) loadMyFeedback();
  }, [session]);

  async function loadMyFeedback() {
    const { data: items } = await supabase
      .from('feedback')
      .select('id, message, page_context, created_at, user_last_read_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    setMyFeedback(items || []);

    if (items && items.length > 0) {
      const ids = items.map((i) => i.id);
      const { data: replies } = await supabase
        .from('feedback_replies')
        .select('*')
        .in('feedback_id', ids)
        .order('created_at', { ascending: true });
      const grouped: Record<string, Reply[]> = {};
      (replies || []).forEach((r) => {
        if (!grouped[r.feedback_id]) grouped[r.feedback_id] = [];
        grouped[r.feedback_id].push(r);
      });
      setRepliesByFeedback(grouped);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);

    const item = myFeedback.find((f) => f.id === id);
    const replies = repliesByFeedback[id] || [];
    if (item && hasUnreadAdminReply(item, replies)) {
      const now = new Date().toISOString();
      await supabase.from('feedback').update({ user_last_read_at: now }).eq('id', id);
      setMyFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, user_last_read_at: now } : f)));
    }
  }

  async function sendReply(feedbackId: string) {
    const text = (replyDraft[feedbackId] || '').trim();
    if (text.length === 0) return;

    setReplySending((prev) => ({ ...prev, [feedbackId]: true }));
    const { data, error: insertError } = await supabase
      .from('feedback_replies')
      .insert({
        feedback_id: feedbackId,
        author_type: 'user',
        author_id: session.user.id,
        message: text,
      })
      .select()
      .single();
    setReplySending((prev) => ({ ...prev, [feedbackId]: false }));

    if (insertError || !data) return;

    setRepliesByFeedback((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] || []), data],
    }));
    setReplyDraft((prev) => ({ ...prev, [feedbackId]: '' }));
  }

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
    if (!anonymous) loadMyFeedback();
    setTimeout(() => setSent(false), 1400);
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
          This goes straight to the team building Dokkit. As we are in Beta stage, we would love to hear your thoughts.
          Any bugs, confusing moments, ideas — anything.
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
            {anonymous && (
              <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>
                Anonymous submissions can't be replied to, since there's no way to attribute a
                response back to you. Uncheck this if you'd like to hear back.
              </p>
            )}

            {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

            <button type="submit" className="btn btn-steel" disabled={loading}>
              {loading ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>

      {myFeedback.length > 0 && (
        <div className="settings-panel">
          <div className="settings-panel-title">Your messages</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {myFeedback.map((item) => {
              const replies = repliesByFeedback[item.id] || [];
              const unread = hasUnreadAdminReply(item, replies);
              const isOpen = expandedId === item.id;
              return (
                <div key={item.id} className="thread-item">
                  <button className="thread-summary" onClick={() => toggleExpand(item.id)}>
                    <div className="thread-summary-text">
                      {unread && <span className="unread-dot" aria-label="Unread reply" />}
                      <span>{item.message}</span>
                    </div>
                    <div className="thread-summary-meta">
                      {replies.length > 0 && <span>{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</span>}
                      <span>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="thread-body">
                      <div className="thread-bubble thread-bubble-user">
                        <div className="thread-bubble-text">{item.message}</div>
                        <div className="thread-bubble-time">
                          {new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>

                      {replies.map((r) => (
                        <div
                          key={r.id}
                          className={r.author_type === 'admin' ? 'thread-bubble thread-bubble-admin' : 'thread-bubble thread-bubble-user'}
                        >
                          {r.author_type === 'admin' && <div className="thread-bubble-label">Dokkit team</div>}
                          <div className="thread-bubble-text">{r.message}</div>
                          <div className="thread-bubble-time">
                            {new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      ))}

                      <div className="thread-input-row">
                        <input
                          type="text"
                          placeholder="Add a reply…"
                          value={replyDraft[item.id] || ''}
                          onChange={(e) => setReplyDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') sendReply(item.id); }}
                        />
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
                          onClick={() => sendReply(item.id)}
                          disabled={replySending[item.id]}
                        >
                          {replySending[item.id] ? '…' : 'Send'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
